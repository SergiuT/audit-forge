import { OpenAIService } from "@/shared/services/openai.service";
import { generateDriftComparison } from "@/shared/utils/compliance-drift.util";
import { calculateComplianceScore, getCategoryScores, getControlScores } from "@/shared/utils/compliance-score.util";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ComplianceReport } from "../entities/compliance-report.entity";
import { ComplianceAnalysis, DriftAnalysis, ReportSource } from "@/shared/types/types";

@Injectable()
export class ComplianceDriftService {
  constructor(
    @InjectRepository(ComplianceReport)
    private complianceReportRepository: Repository<ComplianceReport>,
    private readonly openaiService: OpenAIService,
  ) { }

  async compareWithPrevious(
    projectId: number,
    currentAnalysis: {
      findings: any[];
      complianceScore: number;
      categoryScores: Record<string, number>;
      controlScores: Record<string, number>;
    },
    integrationId?: string,
    source?: ReportSource
  ): Promise<DriftAnalysis | null> {
    const previousReport = await this.findPreviousReport(projectId, integrationId, source);

    if (!previousReport) {
      return null;
    }

    const previousAnalysis = {
      findings: previousReport.findings,
      complianceScore: calculateComplianceScore(previousReport.findings),
      categoryScores: getCategoryScores(previousReport.findings),
      controlScores: getControlScores(previousReport.findings),
    };

    return this.calculateDrift(currentAnalysis, previousAnalysis);
  }

  private async findPreviousReport(projectId: number, integrationId?: string, source?: ReportSource): Promise<ComplianceReport | null> {
    if (integrationId) {
      return this.complianceReportRepository
        .createQueryBuilder('report')
        .leftJoinAndSelect('report.findings', 'finding')
        .where(`report.projectId = :projectId`, { projectId })
        .andWhere(`report.reportData->'details'->>'integrationId' = :integrationId`, { integrationId })
        .orderBy('report.createdAt', 'DESC')
        .getOne();
    }

    // If source is provided, filter by source to only compare reports from the same source
    if (source) {
      return this.complianceReportRepository.findOne({
        where: {
          project: { id: projectId },
          source: source
        },
        order: { createdAt: 'DESC' },
        relations: ['findings', 'findings.actions'],
      });
    }

    return this.complianceReportRepository.findOne({
      where: { project: { id: projectId } },
      order: { createdAt: 'DESC' },
      relations: ['findings', 'findings.actions'],
    });
  }

  private calculateDrift(
    current: ComplianceAnalysis,
    previous: ComplianceAnalysis
  ): DriftAnalysis {
    const drift = generateDriftComparison(
      current.findings,
      previous.findings,
      current.controlScores,
      previous.controlScores,
      current.categoryScores,
      previous.categoryScores,
      current.complianceScore,
      previous.complianceScore,
    );

    const categoryDelta = this.calculateCategoryDelta(
      current.categoryScores,
      previous.categoryScores
    );

    const controlScoreDelta = this.calculateControlDelta(
      current.controlScores,
      previous.controlScores
    );

    return {
      newFindings: drift.newFindings,
      resolvedFindings: drift.resolvedFindings,
      unchangedFindings: drift.unchangedFindings,
      scoreDelta: current.complianceScore - previous.complianceScore,
      categoryScoreDelta: categoryDelta,
      controlScoreDelta,
    };
  }

  private calculateCategoryDelta(
    current: Record<string, number>,
    previous: Record<string, number>
  ): Record<string, number> {
    return Object.keys(current).reduce((acc, category) => {
      const old = previous[category] ?? 100;
      acc[category] = current[category] - old;
      return acc;
    }, {} as Record<string, number>);
  }

  private calculateControlDelta(
    current: Record<string, number>,
    previous: Record<string, number>
  ): Record<string, number> {
    return Object.keys(current).reduce((acc, controlId) => {
      const old = previous[controlId] ?? 100;
      acc[controlId] = current[controlId] - old;
      return acc;
    }, {} as Record<string, number>);
  }

  async generateDriftSummary(drift: DriftAnalysis): Promise<string> {
    const driftPrompt = this.buildDriftPrompt(drift);
    return this.openaiService.generateComplianceSummary(driftPrompt);
  }

  private buildDriftPrompt(drift: DriftAnalysis): string {
    return `
      You are a compliance analyst. Based on the following drift comparison between two audit reports, summarize what changed. Use a professional tone.
  
      ## Drift Details
      Score delta: ${drift.scoreDelta}
      Category deltas: ${Object.entries(drift.categoryScoreDelta)
        .map(([cat, delta]) => `${cat}: ${delta}`)
        .join(', ')}
  
      New Findings:
      ${drift.newFindings?.length ? drift.newFindings.join(', ') : 'None'}
  
      Resolved Findings:
      ${drift.resolvedFindings?.length ? drift.resolvedFindings.join(', ') : 'None'}
  
      Control Score Deltas:
      ${Object.entries(drift.controlScoreDelta)
        .map(([ctrl, delta]) => `${ctrl}: ${delta}`)
        .join(', ')}
  
      TASK: Write a short summary (~100 words) that explains what changed and whether this indicates progress or regression. Mention key CVEs and control IDs that changed. Avoid repeating raw data.
    `;
  }
}