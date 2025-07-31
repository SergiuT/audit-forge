/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// modules/compliance/compliance.service.ts
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { ComplianceReport } from './entities/compliance-report.entity';
import { CreateComplianceReportDto } from './dto/create-compliance-report.dto';
import { S3Service } from '@/shared/services/s3.service';
import { ComplianceFinding } from './entities/compliance-finding.entity';
import {
  calculateComplianceScore,
  determineReportSourceFromPrefix,
  getCategoryScores,
  getControlScores,
} from '@/shared/utils/compliance-score.util';
import { ComplianceAction } from './entities/compliance-action.entity';
import { FINDING_RECOMMENDATIONS } from '@/shared/utils/finding-recommendations.util';
import { OpenAIService } from '@/shared/services/openai.service';
import { PdfService } from '@/shared/services/pdf.service';
import { ChecklistService } from '../checklist/checklist.service';
import { ComplianceRule, RuleSource } from './entities/compliance-rule.entity';
import { ComplianceFindingResult, NvdRulesFilters, PaginationMeta, SeverityOptions } from '@/shared/types/types';
import { Project } from '../project/entities/project.entity';
import { ControlTopic } from './entities/control-topic.entity';
import { generateDriftComparison } from '@/shared/utils/compliance-drift.util';
import { AuditTrailService } from '../audit-trail/audit.service';
import { AuditAction } from '../audit-trail/entities/audit-event.entity';
import { FilterFindingsDto } from './dto/filter-findings.dto';
import { CacheService } from '@/shared/services/cache.service';

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

    @InjectRepository(ComplianceRule)
    private readonly ruleRepository: Repository<ComplianceRule>,

    @InjectRepository(ControlTopic)
    private readonly controlTopicRepository: Repository<ControlTopic>,

    private readonly s3Service: S3Service,
    private readonly checklistService: ChecklistService,
    private readonly pdfService: PdfService,
    private readonly openaiService: OpenAIService,
    private readonly auditTrailService: AuditTrailService,
    private readonly cacheService: CacheService,
  ) { }

  // Get all reports
  async findAll(projectId?: number): Promise<ComplianceReport[]> {
    const cacheKey = projectId ? `reports:project:${projectId}` : 'reports:all';
    return this.cacheService.getOrSet(cacheKey, () => {
      if (projectId) {
        return this.complianceReportRepository.find({ where: { project: { id: projectId } } });
      }
      return this.complianceReportRepository.find();
    }, 1800); // Cache for 30 minutes
  }

  // Get a report by ID
  async findOne(id: number): Promise<any> {
    const report = await this.complianceReportRepository.findOne({
      where: { id },
      relations: ['findings', 'findings.actions', 'project'],
    });

    if (!report) {
      throw new NotFoundException(`Report with ID ${id} not found`);
    }

    try {
      const fileContent = await this.s3Service.getFile(report.fileDataKey);
      const fileContentAsString = fileContent.toString('utf-8'); // Convert Buffer to string (utf-8 encoding)
      const complianceScore = calculateComplianceScore(report.findings);
      const categoryScores = getCategoryScores(report.findings);

      // Return the report along with file content
      return {
        ...report,
        fileContent: fileContentAsString,
        findings: report.findings,
        complianceScore,
        categoryScores,
      };
    } catch (error) {
      throw new BadRequestException(
        'Error retrieving file content: ' + error.message,
      );
    }
  }

  // Create a new report
  async create(
    createReportDto: CreateComplianceReportDto,
    userId: number,
    file: Express.Multer.File,
    prefix?: string,
  ): Promise<ComplianceReport> {
    try {
      if (!file) {
        throw new BadRequestException('File is required');
      }

      const source = determineReportSourceFromPrefix(prefix || 'other')
      const fileContent = file.buffer.toString('utf-8');
      const findings = await this.evaluateComplianceFromContent(fileContent) as ComplianceFinding[];

      const mainImageKey = this.s3Service.generateKey(file.originalname, prefix || "compliance-report");
      const fileUploadResponse = await this.s3Service.uploadFile(
        file,
        mainImageKey,
      );

      const project = await this.projectRepository.findOneBy({ id: createReportDto.projectId });

      if (!project) throw new BadRequestException('Invalid project ID');

      const integrationId = createReportDto.reportData?.integrationId;

      let previousReport: ComplianceReport | null = await this.complianceReportRepository.findOne({
        where: { project: { id: project.id } },
        order: { createdAt: 'DESC' },
        relations: ['findings', 'findings.actions'],
      });

      if (integrationId) {
        previousReport = await this.complianceReportRepository
          .createQueryBuilder('report')
          .leftJoinAndSelect('report.findings', 'finding')
          .where(`report.projectId = :projectId`, { projectId: project.id })
          .andWhere(`report.reportData->'details'->>'integrationId' = :integrationId`, { integrationId })
          .orderBy('report.createdAt', 'DESC')
          .getOne();
      }

      // Ensure fileData is a Buffer and passed correctly
      const report = this.complianceReportRepository.create({
        ...createReportDto,
        fileDataKey: fileUploadResponse,
        source,
        project: project,
      });

      // Calculate previous and current scores
      const newScore = calculateComplianceScore(findings);
      const newCategoryScores = getCategoryScores(findings);
      const newControlScores = getControlScores(findings);

      report.complianceScore = newScore;
      report.categoryScores = newCategoryScores;
      report.controlScores = newControlScores;

      if (previousReport) {
        const previousFindings = previousReport?.findings || [];
        const oldScore = previousReport ? calculateComplianceScore(previousFindings) : 100;
        const oldCategoryScores = previousReport ? getCategoryScores(previousFindings) : {};

        const categoryDelta = Object.keys(newCategoryScores).reduce((acc, category) => {
          const old = oldCategoryScores[category] ?? 100;
          acc[category] = newCategoryScores[category] - old;
          return acc;
        }, {} as Record<string, number>);

        const oldControlScores = previousReport ? getControlScores(previousFindings) : {};
        const controlScoreDelta = Object.keys(newControlScores).reduce((acc, controlId) => {
          const old = oldControlScores[controlId] ?? 100;
          acc[controlId] = newControlScores[controlId] - old;
          return acc;
        }, {} as Record<string, number>);

        const drift = generateDriftComparison(
          findings,
          previousFindings,
          newControlScores,
          oldControlScores || {},
          newCategoryScores,
          oldCategoryScores || {},
          newScore,
          oldScore || 100,
        );

        report.driftComparison = {
          newFindings: drift.newFindings,
          resolvedFindings: drift.resolvedFindings,
          unchangedFindings: drift.unchangedFindings,
          scoreDelta: newScore - oldScore,
          categoryScoreDelta: categoryDelta,
          controlScoreDelta,
        };

        if (report.driftComparison) {
          const driftPrompt = `
            You are a compliance analyst. Based on the following drift comparison between two audit reports, summarize what changed. Use a professional tone.
        
            ## Drift Details
            Score delta: ${report.driftComparison.scoreDelta}
            Category deltas: ${Object.entries(report.driftComparison.categoryScoreDelta)
              .map(([cat, delta]) => `${cat}: ${delta}`)
              .join(', ')}
        
            New Findings:
            ${report.driftComparison.newFindings?.length ? report.driftComparison.newFindings.join(', ') : 'None'}
        
            Resolved Findings:
            ${report.driftComparison.resolvedFindings?.length ? report.driftComparison.resolvedFindings.join(', ') : 'None'}
        
            Control Score Deltas:
            ${Object.entries(report.driftComparison.controlScoreDelta)
              .map(([ctrl, delta]) => `${ctrl}: ${delta}`)
              .join(', ')}
        
            TASK: Write a short summary (~100 words) that explains what changed and whether this indicates progress or regression. Mention key CVEs and control IDs that changed. Avoid repeating raw data.
          `;

          const driftSummary = await this.openaiService.generateComplianceSummary(driftPrompt);
          report.driftSummary = driftSummary;
        }
      }

      // Findings
      const savedReport = await this.complianceReportRepository.save(report);

      await this.auditTrailService.logEvent({
        userId,
        projectId: report.project.id,
        action: AuditAction.REPORT_CREATED,
        resourceType: 'ComplianceReport',
        resourceId: report.id.toString(),
        metadata: {
          source: report.source,
          complianceScore: report.complianceScore,
          findings,
        },
      });

      const findingEntities = findings.map((f) =>
        this.findingRepository.create({ ...f, report: savedReport, projectId: project.id }),
      );
      await this.findingRepository.save(findingEntities);

      // Actions
      const savedFindings = await this.findingRepository.save(findingEntities);
      const actionsToSave = savedFindings.map((finding) =>
        this.actionRepository.create({
          recommendation:
            FINDING_RECOMMENDATIONS[finding.rule] ||
            'Review this finding and take appropriate action.',
          finding,
          projectId: project.id,
        }),
      );
      await this.actionRepository.save(actionsToSave);

      await this.checklistService.createChecklistItemsForReport(savedReport);

      return savedReport;
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
  ): Promise<{ summary: string }> {
    const report = await this.complianceReportRepository.findOne({
      where: { id },
      relations: ['findings'],
    });

    if (!report) throw new NotFoundException(`Report with ID ${id} not found`);

    const checklistStats = await this.checklistService.getChecklistMetrics(id);

    if (!regenerate && report.aiSummary) {
      return { summary: report.aiSummary };
    }

    const fileContent = await this.s3Service.getFile(report.fileDataKey);
    const fileContentAsString = fileContent.toString('utf-8');

    const logSource = report.source === 'Other' ? 'Generic' : report.source;
    const complianceScore = calculateComplianceScore(report.findings);

    const toneInstructions = {
      executive: 'High-level summary with key insights for stakeholders.',
      technical: 'Detailed explanation of each finding with standards references.',
      remediation: 'Prioritized remediation plan with action steps.',
      educational: 'Explain security gaps and best practices in simple terms.',
    };

    const input = `
      You are a professional SOC2/ISO27001 compliance assistant for ${logSource} logs. A system scan was performed, and the following data was collected:

      ## File content
      ${fileContentAsString}

      ### 📝 Findings (${report.findings.length})
      ${report.findings.map((f) => {
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

    const summary = await this.openaiService.generateComplianceSummary(input);

    report.aiSummary = summary;
    report.aiSummaryGeneratedAt = new Date();
    await this.complianceReportRepository.save(report);

    return { summary };
  }

  // Generate compliance PDF report
  async generatePDF(id: number): Promise<Buffer> {
    const report = await this.findOne(id);

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

  async findOneByRunId(runId: number): Promise<ComplianceReport | null> {
    return this.complianceReportRepository.createQueryBuilder('report')
      .where(`report."reportData"->'details'->>'runId' = :runId`, { runId: String(runId) })
      .orderBy('report.createdAt', 'DESC')
      .getOne();
  }

  async findAllControlTopics(): Promise<ControlTopic[]> {
    return this.cacheService.getOrSet('control_topics:all', () => {
      return this.controlTopicRepository.find({ relations: ['controls'] });
    }, 7200);
  }

  async filterFindings(reportId: number, filters: FilterFindingsDto) {
    const query = this.findingRepository
      .createQueryBuilder('finding')
      .where('finding.reportId = :reportId', { reportId });

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

  async evaluateComplianceFromContent(logContent: string): Promise<ComplianceFindingResult[]> {
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
          const matches = logContent.match(regex);
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
  
    if (findings.length === 0) {
      this.logger.debug('No regex matches. Using Pinecone fallback...');
      // return await this.evaluateComplianceFromContentWithPinecone(logContent);
    }
  
    return findings;
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

  async update(id: number, updateReportDto: any): Promise<ComplianceReport> {
    const report = await this.findOne(id); // This will throw if not found

    Object.assign(report, updateReportDto); // Update report with new data
    return this.complianceReportRepository.save(report);
  }

  async delete(id: number): Promise<void> {
    const report = await this.findOne(id); // This will throw if not found
    await this.complianceReportRepository.remove(report);
  }
}
