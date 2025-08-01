import { ComplianceAnalysis, ComplianceFindingResult, SeverityOptions } from "@/shared/types/types";
import { calculateComplianceScore, getCategoryScores, getControlScores } from "@/shared/utils/compliance-score.util";
import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ComplianceRule, RuleSource } from "../entities/compliance-rule.entity";
import { ComplianceFinding } from "../entities/compliance-finding.entity";

@Injectable()
export class ComplianceAnalysisService {
  private readonly logger = new Logger(ComplianceAnalysisService.name)
  constructor(
    @InjectRepository(ComplianceRule)
    private readonly ruleRepository: Repository<ComplianceRule>,
  ) {}

  async analyzeComplianceContent(content: string): Promise<ComplianceAnalysis> {
    const findings = await this.evaluateComplianceFromContent(content) as ComplianceFinding[];
    
    const complianceScore = calculateComplianceScore(findings);
    const categoryScores = getCategoryScores(findings);
    const controlScores = getControlScores(findings);

    return {
      findings,
      complianceScore,
      categoryScores,
      controlScores,
    };
  }

  private async evaluateComplianceFromContent(content: string): Promise<ComplianceFindingResult[]> {
    const findings: ComplianceFindingResult[] = [];
    const CHUNK_SIZE = 1000;
    const total = await this.ruleRepository.count({ where: { source: RuleSource.NVD } });

    for (let offset = 0; offset < total; offset += CHUNK_SIZE) {
      const chunk = await this.ruleRepository.find({
        where: { source: RuleSource.NVD },
        take: CHUNK_SIZE,
        skip: offset,
      });

      for (const rule of chunk) {
        if (!rule.pattern) continue;

        try {
          const regex = new RegExp(rule.pattern, 'gi');
          const matches = content.match(regex);
          if (matches) {
            findings.push({
              rule: rule.rule,
              description: rule.description,
              severity: rule.severity.toUpperCase() as SeverityOptions,
              category: rule.category,
              tags: rule.tags || [],
              mappedControls: rule.mappedControls || [],
            });
          }
        } catch (err) {
          this.logger.warn(`Invalid regex: ${rule.pattern} in rule ${rule.rule}`);
        }
      }
    }

    return findings;
  }
}