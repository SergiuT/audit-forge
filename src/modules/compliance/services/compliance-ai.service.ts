import { ChecklistService } from "@/modules/checklist/checklist.service";
import { OpenAIService } from "@/shared/services/openai.service";
import { calculateComplianceScore } from "@/shared/utils/compliance-score.util";
import { Injectable } from "@nestjs/common";
import { ComplianceFinding } from "../entities/compliance-finding.entity";
import { ComplianceReport } from "../entities/compliance-report.entity";

@Injectable()
export class ComplianceAIService {
  constructor(
    private readonly openaiService: OpenAIService,
    private readonly checklistService: ChecklistService,
  ) {}

  async generateSummary(
    report: ComplianceReport,
    fileContent: string,
    regenerate = false,
    tone: 'executive' | 'technical' | 'remediation' | 'educational' = 'executive'
  ): Promise<string> {
    if (!regenerate && report.aiSummary) {
      return report.aiSummary;
    }

    const checklistStats = await this.checklistService.getChecklistMetrics(report.id);
    const complianceScore = calculateComplianceScore(report.findings);
    const logSource = report.source === 'Other' ? 'Generic' : report.source;

    const prompt = this.buildSummaryPrompt(
      fileContent,
      report.findings,
      complianceScore,
      checklistStats,
      logSource,
      tone
    );

    return this.openaiService.generateComplianceSummary(prompt);
  }

  private buildSummaryPrompt(
    fileContent: string,
    findings: ComplianceFinding[],
    complianceScore: number,
    checklistStats: any,
    logSource: string,
    tone: string
  ): string {
    const toneInstructions = {
      executive: 'High-level summary with key insights for stakeholders.',
      technical: 'Detailed explanation of each finding with standards references.',
      remediation: 'Prioritized remediation plan with action steps.',
      educational: 'Explain security gaps and best practices in simple terms.',
    };

    return `
      You are a professional SOC2/ISO27001 compliance assistant for ${logSource} logs. A system scan was performed, and the following data was collected:

      ## File content
      ${fileContent}

      ### 📝 Findings (${findings.length})
      ${findings.map((f) => {
        const controls = f.mappedControls?.length ? ` ↪️ Controls: ${f.mappedControls.join(', ')}` : '';
        return `- [${f.severity.toUpperCase()}] ${f.description}${controls}`;
      }).join('\n')}

      ## 📊 Insights
      - Compliance Score: ${complianceScore}%
      - Checklist Completion: ${checklistStats.completion}%
      - Resolved: ${checklistStats.resolved}, In Progress: ${checklistStats.inProgress}, Unresolved: ${checklistStats.unresolved}
      ---

      ### 🎯 TASK:
      Write a clear, human-readable security summary that includes:
      1. Key security risks based on the findings
      2. Overall risk level (low / medium / high)
      3. Priority areas for improvement
      4. Remediation steps
      5. A brief note on current compliance progress (based on checklist stats above)

      Avoid repeating the raw logs. Use a ${tone} tone. Bullet points are encouraged. ${toneInstructions[tone]}
    `;
  }
}