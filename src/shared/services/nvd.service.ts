import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ComplianceRule, RuleSource } from '@/modules/compliance/entities/compliance-rule.entity';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NormalizedLogEvent, NvdRulesFilters, PaginationMeta } from '../types/types';
import { CacheService } from './cache.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class NvdService {
  private readonly logger = new Logger(NvdService.name);
  private readonly feedUrl =
    'https://nvd.nist.gov/feeds/json/cve/1.1/nvdcve-1.1-modified.json.gz';

  constructor(
    @InjectRepository(ComplianceRule)
    private ruleRepo: Repository<ComplianceRule>,

    @InjectRepository(ComplianceRule)
    private ruleRepository: Repository<ComplianceRule>,

    private readonly cacheService: CacheService,
    private configService: ConfigService
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
  
    while (startIndex < totalResults) {
      const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?resultsPerPage=${pageSize}&startIndex=${startIndex}`;

      try {
        const response = await axios.get(url, {
          headers: {
            'apiKey': this.configService.get<string>('NVD_API_KEY'),
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

  async getNvdRules(filters: NvdRulesFilters): Promise<{ rules: ComplianceRule[], pagination: PaginationMeta }> {
    const cacheKey = `nvd_rules:${JSON.stringify(filters)}`;
    
    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const { page = 1, limit = 10, ...queryFilters } = filters;
        const offset = (page - 1) * limit;
  
        const baseQuery = this.ruleRepository
          .createQueryBuilder('rule')
          .where('rule.source = :source', { source: RuleSource.NVD });
  
        this.applyNvdFilters(baseQuery, queryFilters);
  
        const rules = await baseQuery
          .orderBy('rule.metadata->>\'publishedDate\'', 'DESC')
          .skip(offset)
          .take(limit)
          .getMany();
  
        const countQuery = this.ruleRepository
          .createQueryBuilder('rule')
          .where('rule.source = :source', { source: RuleSource.NVD });
        
        this.applyNvdFilters(countQuery, queryFilters);
        const totalCount = await countQuery.getCount();
  
        // Calculate pagination metadata
        const totalPages = Math.ceil(totalCount / limit);
        const pagination: PaginationMeta = {
          page,
          limit,
          total: totalCount,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        };
  
        return { rules, pagination };
      },
      3600 // Cache for 1 hour
    );
  }

  private applyNvdFilters(
    queryBuilder: SelectQueryBuilder<ComplianceRule>, 
    filters: Omit<NvdRulesFilters, 'page' | 'limit'>
  ): void {
    const filterMap = {
      severity: 'rule.severity',
      category: 'rule.category', 
      cveId: 'rule.cveId',
      fromDate: 'rule.metadata->>\'publishedDate\'',
      toDate: 'rule.metadata->>\'publishedDate\''
    };
  
    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        const field = filterMap[key as keyof typeof filterMap];
        if (field) {
          if (key === 'fromDate') {
            queryBuilder.andWhere(`${field} >= :${key}`, { [key]: value });
          } else if (key === 'toDate') {
            queryBuilder.andWhere(`${field} <= :${key}`, { [key]: value });
          } else {
            queryBuilder.andWhere(`${field} = :${key}`, { [key]: value });
          }
        }
      }
    });
  }

  async delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
