import { Injectable, NotFoundException } from '@nestjs/common';
import { ComplianceFinding } from '../compliance/entities/compliance-finding.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { OpenAIService } from '@/shared/services/openai.service';
import { TagExplanation } from './entities/tag-explanation.entity';
import { ComplianceReport } from '../compliance/entities/compliance-report.entity';
import {
  ChecklistStatus,
  ControlChecklistItem,
} from '../checklist/entities/control-checklist.entity';
import { User } from '../auth/entities/user.entity';
import { PineconeService } from '@/shared/services/pinecone.service';

@Injectable()
export class FindingsService {
  constructor(
    @InjectRepository(ComplianceFinding)
    private findingRepository: Repository<ComplianceFinding>,

    @InjectRepository(ComplianceReport)
    private complianceReportRepository: Repository<ComplianceReport>,

    @InjectRepository(TagExplanation)
    private readonly explanationRepository: Repository<TagExplanation>,

    @InjectRepository(ControlChecklistItem)
    private readonly checklistRepository: Repository<ControlChecklistItem>,

    private readonly openaiService: OpenAIService,

    private readonly pineconeService: PineconeService,
  ) {}

  // Get findings for report
  async getFindingsForReport(reportId: number, user: User): Promise<ComplianceFinding[]> {
    return await this.findingRepository.find({
      where: { report: { id: reportId }, projectId: In(user.projects.map(p => p.id)) },
      relations: ['actions'],
    });
  }

  async groupFindingsByControl(reportId: number, user: User): Promise<
    Record<
      string,
      {
        controlId: string;
        title: string;
        description: string;
        findings: ComplianceFinding[];
      }
    >
  > {
    const findings = await this.findingRepository.find({
      where: { report: { id: reportId }, projectId: In(user.projects.map(p => p.id)) },
      relations: ['report'],
    });

    const allControlIds = new Set<string>();
    findings.forEach((f) => f.mappedControls?.forEach((c) => allControlIds.add(c)));

    const controlsMap = await this.pineconeService.fetchControlsByIds(Array.from(allControlIds));

    const grouped: Record<string, any> = {};

    findings.forEach((finding) => {
      finding.mappedControls?.forEach((controlId) => {
        if (!grouped[controlId]) {
          const control = controlsMap[controlId];
          grouped[controlId] = {
            controlId,
            title: control?.title || 'Unknown Control',
            description: control?.description || '',
            findings: [],
          };
        }
        grouped[controlId].findings.push(finding);
      });
    });

    for (const controlId of Object.keys(grouped)) {
      const findings = grouped[controlId].findings;
    
      // Tag summary
      const tagCounts: Record<string, number> = {};
      findings.forEach((f) => {
        f.tags?.forEach((tag) => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      });
    
      // Severity summary
      const severityCounts: Record<string, number> = {
        high: 0,
        medium: 0,
        low: 0,
      };
      findings.forEach((f) => {
        severityCounts[f.severity as keyof typeof severityCounts]++;
      });
    
      // Attach to grouped output
      grouped[controlId].tagCounts = tagCounts;
      grouped[controlId].severityCounts = severityCounts;
    }

    return grouped;
  }

  // Generate mapped controls
  async generateControlChecklistForReport(reportId: number, user: User): Promise<
    {
      control: string;
      affectedFindings: string[];
      title: string;
      status: ChecklistStatus;
      description: string;
    }[]
  > {
    const checklistItems = await this.checklistRepository.find({
      where: { report: { id: reportId }, projectId: In(user.projects.map(p => p.id)) },
    });

    const report = await this.complianceReportRepository.findOne({
      where: { id: reportId, userId: user.id },
    });
    if (!report) throw new NotFoundException('Report not found');

    const findings = await this.findingRepository.find({
      where: { report: { id: reportId }, projectId: In(user.projects.map(p => p.id)) },
    });

    const controlMap: Record<string, ComplianceFinding[]> = {};

    findings.forEach((f) => {
      f.mappedControls?.forEach((controlId) => {
        if (!controlMap[controlId]) {
          controlMap[controlId] = [];
        }
        controlMap[controlId].push(f);
      });
    });

    const controlIds = Object.keys(controlMap);
    const controlsMap = await this.pineconeService.fetchControlsByIds(Array.from(controlIds));

    return Array.from(controlsMap.values()).map((control) => {
      const item = checklistItems.find(
        (i) => i.controlId === control.controlId,
      );
      return {
        control: control.controlId,
        title: control.title,
        description: control.description,
        status: item?.status ?? ChecklistStatus.UNRESOLVED,
        affectedFindings: controlMap[control.controlId]?.map(f => f.rule) ?? [],
        findings: controlMap[control.controlId] ?? [],
      };
    });
  }

  async fetchAndCacheTagExplanationsInBackground(findings: ComplianceFinding[]) {
    const allTags = [...new Set(findings.flatMap(f => f.tags ?? []))];
    for (const tag of allTags) {
      // Check if explanation exists
      let explanation = await this.explanationRepository.findOne({ where: { tag } });
      if (!explanation) {
        const result = await this.getTagExplanation(tag);
        await this.explanationRepository.save({ tag, explanation: result.explanation });
      }
    }
  }

  // Get findings by tags
  async findFindingsByTags(user: User, filters: {
    severity?: string;
    category?: string;
    tags?: string[];
    reportId?: number;
  }): Promise<ComplianceFinding[]> {
    const qb = this.findingRepository
      .createQueryBuilder('finding')
      .leftJoinAndSelect('finding.actions', 'actions')
      .leftJoinAndSelect('finding.report', 'report')
      .where('finding.projectId IN (:...projectIds)', { projectIds: user.projects.map(p => p.id) });

    if (filters.severity) {
      qb.andWhere('finding.severity = :severity', { severity: filters.severity });
    }
  
    if (filters.category) {
      qb.andWhere('finding.category = :category', { category: filters.category });
    }
  
    if (filters.tags?.length) {
      qb.andWhere('finding.tags && ARRAY[:...tags]', { tags: filters.tags });
    }
  
    if (typeof filters.reportId === 'number') {
      qb.andWhere('finding.reportId = :reportId', { reportId: filters.reportId });
    }

    const findings = await qb.getMany();

    // 🧠 Resolve tag explanations
    const allTags = findings.flatMap((f) => f.tags ?? []);
    const tagExplanations = await this.fetchTags(allTags);

    return findings.map((finding) => ({
      ...finding,
      tagExplanations: (finding.tags || []).map((tag) => ({
        tag,
        explanation: tagExplanations[tag],
      })),
    }));
  }

  // Get tag counts for findings
  async getTagCounts(user: User): Promise<{ tag: string; count: number }[]> {
    const findings = await this.findingRepository.find({
      where: { projectId: In(user.projects.map(p => p.id)) },
    });

    const tagMap: Record<string, number> = {};

    findings.forEach((f) => {
      f.tags?.forEach((tag) => {
        tagMap[tag] = (tagMap[tag] || 0) + 1;
      });
    });

    return Object.entries(tagMap)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count); // Sort by frequency desc
  }

  async fetchTags(tags: string[]): Promise<TagExplanation[]> {
    return await this.explanationRepository.find({ where: { tag: In(tags) } });
  }

  // Get AI tag explanation
  async getTagExplanation(
    tag: string,
    regenerate = false,
  ): Promise<{ tag: string; explanation: string }> {
    // Check cache
    let existing = await this.explanationRepository.findOne({ where: { tag } });
    if (!regenerate && existing) {
      return { tag: existing.tag, explanation: existing.explanation };
    }

    // Ask GPT to explain
    const prompt = `
      You are a security compliance expert.

      Explain what the tag "${tag}" means in the context of SOC2 and ISO 27001 compliance. 
      Your explanation should:
      - Be clear and concise (under 120 words)
      - Mention why this tag is relevant during audits
      - Include 2–3 bullet points that describe:
        • What it means
        • When it applies
        • Why it matters

      Avoid technical jargon. Speak as if educating a startup founder preparing for their first audit.
    `;

    const explanation = await this.openaiService.generateComplianceSummary(prompt);

    await this.explanationRepository.save({ tag, explanation });

    return { tag, explanation };
  }

  async getFullReport(reportId: number): Promise<ComplianceReport> {
    return this.complianceReportRepository.findOneOrFail({
      where: { id: reportId },
      relations: ['findings', 'project'],
    });
  }
}
