// src/shared/services/nvd.service.ts
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ComplianceRule, RuleSource } from '@/modules/compliance/entities/compliance-rule.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { ControlTopic } from '@/modules/compliance/entities/control-topic.entity';
import { cosineSimilarity } from '../utils/cosine-similarity.util';
import { OpenAIService } from './openai.service';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class NvdService {
  private readonly logger = new Logger(NvdService.name);
  private readonly feedUrl =
    'https://nvd.nist.gov/feeds/json/cve/1.1/nvdcve-1.1-modified.json.gz';

  constructor(
    @InjectRepository(ComplianceRule)
    private ruleRepo: Repository<ComplianceRule>,

    @InjectRepository(ControlTopic)
    private topicRepository: Repository<ControlTopic>,

    private readonly openaiService: OpenAIService
  ) {}

  // Every day at 2am
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async syncNvdDaily() {
    await this.syncNvdFeedV2();
  }

  async syncNvdFeedV2() {
    this.logger.log('Fetching CVEs from NVD 2.0 API...');
  
    let startIndex = 24300;
    const pageSize = 200;
    let totalResults = 290000;
    let inserted = 0;

    let topics = await this.topicRepository.find();
  
    while (startIndex < totalResults) {
      const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?resultsPerPage=${pageSize}&startIndex=${startIndex}`;

      try {
        const response = await axios.get(url, {
          headers: {
            'apiKey': process.env.NVD_API_KEY,
          },
        });
        const data = response.data;
    
        const items = data.vulnerabilities || [];
        totalResults = data.totalResults;
    
        for (const vuln of items) {
          const item = vuln.cve;
    
          const cveId = item.id;
          const description = item.descriptions?.find((d: any) => d.lang === 'en')?.value || '';
          const severity = item.metrics?.cvssMetricV31?.[0]?.cvssData?.baseSeverity?.toLowerCase() ||
            item.metrics?.cvssMetricV2?.[0]?.baseSeverity?.toLowerCase() ||
            'medium';
    
          const v3 = item.metrics?.cvssMetricV31?.[0];
          const v2 = item.metrics?.cvssMetricV2?.[0];
    
          const cvssData = v3?.cvssData || v2?.cvssData;
    
          const existing = await this.ruleRepo.findOne({ where: { cveId, source: RuleSource.NVD } });
          if (existing) continue;
    
          const rule = this.ruleRepo.create({
            rule: `CVE: ${cveId}`,
            description,
            source: RuleSource.NVD,
            cveId,
            severity,
            category: 'vulnerability',
            pattern: cveId,
            tags: ['cve', 'vulnerability'],
            metadata: {
              published: item.published,
              cvss: {
                version: v3 ? '3.1' : v2 ? '2.0' : null,
                score: cvssData?.baseScore || null,
                vector: cvssData?.vectorString || null,
                attackVector: cvssData?.attackVector || v2?.cvssData?.accessVector || null,
                confidentialityImpact: cvssData?.confidentialityImpact || null,
                integrityImpact: cvssData?.integrityImpact || null,
                availabilityImpact: cvssData?.availabilityImpact || null,
                exploitabilityScore: v3?.exploitabilityScore || v2?.exploitabilityScore || null,
                impactScore: v3?.impactScore || v2?.impactScore || null,
              },
            },
          });
  
          const embedding = await this.openaiService.getEmbedding(description);
          const scored = topics
            .map((topic) => ({
              slug: topic.slug,
              score: cosineSimilarity(topic.embedding, embedding),
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);
          
          rule.embedding = embedding;
          rule.topicTags = scored.map((s) => s.slug);
      
            await this.ruleRepo.save(rule);
            inserted++;
          }
      } catch (error) {
        this.logger.error(`Failed to fetch NVD data at startIndex ${startIndex}: ${error.message}`);
        await this.delay(10000);
        continue;
      }

      startIndex += pageSize;
      await this.delay(6000)
    }
  
    this.logger.log(`✅ Synced ${inserted} new NVD rules.`);
    return inserted;
  }

  async tagRuleWithTopics(
    rule: ComplianceRule,
    topics: ControlTopic[],
  ): Promise<string[]> {
    const input = rule.description; // or `${rule.rule}: ${rule.description}`
    const embedding = await this.openaiService.getEmbedding(input);

    const scored = topics
      .map((topic) => ({
        slug: topic.slug,
        score: cosineSimilarity(topic.embedding, embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3); // top 3 matches

    return scored.map((s) => s.slug);
  }

  async delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
