/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ComplianceReport } from './entities/compliance-report.entity';
import { CreateComplianceReportDto } from './dto/create-compliance-report.dto';
import { ComplianceFinding } from './entities/compliance-finding.entity';
import {
  calculateComplianceScore,
  determineReportSourceFromPrefix,
  getCategoryScores,
  getControlScores,
} from '@/shared/utils/compliance-score.util';
import { ComplianceAction } from './entities/compliance-action.entity';
import { FINDING_RECOMMENDATIONS } from '@/shared/utils/finding-recommendations.util';
import { PdfService } from '@/shared/services/pdf.service';
import { ChecklistService } from '../checklist/checklist.service';
import { DriftAnalysis } from '@/shared/types/types';
import { Project } from '../project/entities/project.entity';
import { FilterFindingsDto } from './dto/filter-findings.dto';
import { ComplianceAIService } from './services/compliance-ai.service';
import { ComplianceDriftService } from './services/compliance-drift.service';
import { ComplianceFileService } from './services/compliance-file.service';
import { ComplianceReportService } from './services/compliance-report.service';
import { User } from '../auth/entities/user.entity';
import { AIAgentService } from '../ai-agents/ai-agent.service';

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name)
  constructor(
    @InjectRepository(ComplianceReport)
    private complianceReportRepository: Repository<ComplianceReport>,

    @InjectRepository(Project)
    private projectRepository: Repository<Project>,

    @InjectRepository(ComplianceFinding)
    private findingRepository: Repository<ComplianceFinding>,

    @InjectRepository(ComplianceAction)
    private actionRepository: Repository<ComplianceAction>,

    private readonly checklistService: ChecklistService,
    private readonly reportService: ComplianceReportService,
    private readonly fileService: ComplianceFileService,
    private readonly driftService: ComplianceDriftService,
    private readonly aiService: ComplianceAIService,
    private readonly pdfService: PdfService,
    private readonly aiAgentService: AIAgentService,
  ) { }

  // Create a new report
  async create(
    createReportDto: CreateComplianceReportDto,
    logContent: string,
    user: User,
    prefix?: string,
  ): Promise<ComplianceReport> {
    try {
      // 1. Analyze file content
      const analysisFindings = await this.aiAgentService.analyzeLogsForCompliance(logContent, prefix || 'other') as ComplianceFinding[];

      const analysis = {
        findings: analysisFindings,
        complianceScore: calculateComplianceScore(analysisFindings),
        categoryScores: getCategoryScores(analysisFindings),
        controlScores: getControlScores(analysisFindings),
      };

      // 2. Compare with previous report (if exists)
      const source = determineReportSourceFromPrefix(prefix || 'other');
      const drift = await this.driftService.compareWithPrevious(
        createReportDto.projectId,
        analysis,
        createReportDto.reportData?.integrationId,
        source,
        createReportDto.reportData?.details?.repo
      );

      // 3. Upload file to S3
      const fileData = await this.fileService.uploadComplianceFile(
        logContent,
        prefix
      );

      // 4. Create report
      const reportData: CreateComplianceReportDto = {
        ...createReportDto,
        fileDataKey: fileData.key,
        source: source,
        complianceScore: analysis.complianceScore,
        categoryScores: analysis.categoryScores,
        controlScores: analysis.controlScores,
        driftComparison: drift || undefined,
      };

      const report = await this.reportService.create(reportData);

      // 5. Save findings and actions
      const findingEntities = analysis.findings.map((findingResult) =>
        this.findingRepository.create({
          rule: findingResult.rule,
          description: findingResult.description,
          severity: findingResult.severity,
          category: findingResult.category,
          tags: findingResult.tags,
          mappedControls: findingResult.mappedControls,
          report: report,
          projectId: createReportDto.projectId,
        }),
      );

      if (!report || !report.id) {
        throw new BadRequestException('Failed to create report');
      }

      // Actions
      const savedFindings = await this.findingRepository.save(findingEntities);
      const actionsToSave = savedFindings.map((finding) =>
        this.actionRepository.create({
          recommendation:
            FINDING_RECOMMENDATIONS[finding.rule] ||
            'Review this finding and take appropriate action.',
          finding,
          projectId: createReportDto.projectId,
        }),
      );
      await this.actionRepository.save(actionsToSave);
      await this.checklistService.createChecklistItemsForReport(report);

      // 6. Generate AI summary asynchronously
      this.generateSummaryAsync(report.id, fileData.content, user).catch(err =>
        this.logger.error('Failed to generate AI summary', err)
      );

      // 7. Generate drift summary if applicable
      if (drift) {
        this.generateDriftSummaryAsync(report.id, drift, user).catch(err =>
          this.logger.error('Failed to generate drift summary', err)
        );
      }

      return report;
    } catch (error) {
      throw new BadRequestException(
        'Error creating compliance report: ' + error.message,
      );
    }
  }

  // Generate AI Summary
  async generateSummary(
    id: number,
    regenerate = false,
    tone: 'executive' | 'technical' | 'remediation' | 'educational' = 'executive',
    user: User
  ): Promise<{ summary: string }> {
    const report = await this.reportService.findOne(id, user);
    const fileContent = await this.fileService.getFileContent(report.fileDataKey);

    if (!report) {
      throw new NotFoundException(`Report with ID ${id} not found`);
    }

    const summary = await this.aiService.generateSummary(
      report,
      fileContent,
      regenerate,
      tone,
      user
    );

    // Update report with summary
    await this.reportService.update(id, {
      aiSummary: summary,
      aiSummaryGeneratedAt: new Date(),
    }, user);

    return { summary };
  }

  // Generate compliance PDF report
  async generatePDF(id: number, user: User): Promise<Buffer> {
    const report = await this.reportService.findOne(id, user);

    if (!report) {
      throw new NotFoundException(`Report with ID ${id} not found`);
    }

    const pdfBuffer = await this.pdfService.generateComplianceReport({
      summary: report.aiSummary,
      complianceScore: report.complianceScore,
      categoryScores: report.categoryScores,
      findings: report.findings.map((f) => ({
        rule: f.rule,
        description: f.description,
        severity: f.severity,
        category: f.category,
        recommendation: f.actions?.[0]?.recommendation ?? 'N/A',
        controls: f.mappedControls?.join(', ') || 'None',
      })),
    });

    return pdfBuffer;
  }

  private async generateSummaryAsync(reportId: number, fileContent: string, user: User): Promise<void> {
    try {
      const report = await this.reportService.findOne(reportId, user);
      const summary = await this.aiService.generateSummary(report, fileContent, false, 'executive', user);

      await this.reportService.update(reportId, {
        aiSummary: summary,
        aiSummaryGeneratedAt: new Date(),
      }, user);
    } catch (error) {
      this.logger.error(`Failed to generate summary for report ${reportId}`, error);
    }
  }

  private async generateDriftSummaryAsync(reportId: number, drift: DriftAnalysis, user: User): Promise<void> {
    try {
      const summary = await this.driftService.generateDriftSummary(drift);

      await this.reportService.update(reportId, {
        driftSummary: summary,
      }, user);
    } catch (error) {
      this.logger.error(`Failed to generate drift summary for report ${reportId}`, error);
    }
  }

  async findOneByRunId(runId: number): Promise<ComplianceReport | null> {
    return this.complianceReportRepository.createQueryBuilder('report')
      .where(`report."reportData"->'details'->>'runId' = :runId`, { runId: String(runId) })
      .orderBy('report.createdAt', 'DESC')
      .getOne();
  }

  async filterFindings(reportId: number, filters: FilterFindingsDto, user: User) {
    const projectIds = user.projects.map(p => p.id);

    const query = this.findingRepository
      .createQueryBuilder('finding')
      .where('finding.reportId = :reportId', { reportId })
      .andWhere('finding.projectId IN (:...projectIds)', { projectIds });

    if (filters?.severity?.length) {
      query.andWhere('finding.severity IN (:...severity)', {
        severity: filters.severity,
      });
    }

    if (filters?.category?.length) {
      query.andWhere('finding.category IN (:...category)', {
        category: filters.category,
      });
    }

    if (filters?.controlIds?.length) {
      query.andWhere(
        `(${filters.controlIds.map((_, i) => `:control${i} = ANY(finding.mappedControls)`).join(' OR ')})`,
        Object.fromEntries(filters.controlIds.map((c, i) => [`control${i}`, c]))
      );
    }

    if (filters?.topicTags?.length) {
      query.andWhere(
        `(${filters.topicTags.map((_, i) => `:tag${i} = ANY(finding.tags)`).join(' OR ')})`,
        Object.fromEntries(filters.topicTags.map((t, i) => [`tag${i}`, t]))
      );
    }

    if (filters?.search) {
      query.andWhere('finding.description ILIKE :search', {
        search: `%${filters.search}%`,
      });
    }

    return await query.getMany();
  }

  async getReportsForProject(projectId: number): Promise<ComplianceReport[]> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
      relations: ['reports'],
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${projectId} not found`);
    }

    return project.reports;
  }

  async saveFindings({
    reportId,
    findings,
  }: {
    reportId: number;
    findings: Omit<ComplianceFinding, 'id'>[];
  }) {
    const enriched = findings.map(f => ({
      ...f,
      reportId,
    }));
    return this.findingRepository.save(enriched);
  }
}
