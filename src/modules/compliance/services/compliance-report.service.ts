import { AuditTrailService } from "@/modules/audit-trail/audit.service";
import { AuditAction } from "@/modules/audit-trail/entities/audit-event.entity";
import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ComplianceReport } from "../entities/compliance-report.entity";
import { CacheService } from "@/shared/services/cache.service";
import { CreateComplianceReportDto } from "../dto/create-compliance-report.dto";
import { calculateComplianceScore, getCategoryScores } from "@/shared/utils/compliance-score.util";
import { ComplianceFileService } from "./compliance-file.service";

@Injectable()
export class ComplianceReportService {
  constructor(
    @InjectRepository(ComplianceReport)
    private complianceReportRepository: Repository<ComplianceReport>,
    private readonly auditTrailService: AuditTrailService,
    private readonly cacheService: CacheService,
    private readonly fileService: ComplianceFileService,
  ) {}

  // Get all reports
  async findAll(projectId?: number): Promise<ComplianceReport[]> {
    const cacheKey = projectId ? `reports:project:${projectId}` : 'reports:all';
    return this.cacheService.getOrSet(cacheKey, () => {
      if (projectId) {
        return this.complianceReportRepository.find({ 
          where: { project: { id: projectId } } 
        });
      }
      return this.complianceReportRepository.find();
    }, 1800);
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

    const fileContent = await this.fileService.getFileContent(report.fileDataKey);
  
    return {
        ...report,
        fileContent,
        complianceScore: calculateComplianceScore(report.findings),
        categoryScores: getCategoryScores(report.findings),
    };
  }

  // Create a report
  async create(reportData: CreateComplianceReportDto, userId: number, source: string): Promise<ComplianceReport> {
    const savedReport = await this.complianceReportRepository.save(reportData);

    await this.auditTrailService.logEvent({
      userId,
      projectId: reportData.projectId,
      action: AuditAction.REPORT_CREATED,
      resourceType: 'ComplianceReport',
      resourceId: savedReport.id.toString(),
      metadata: {
        source,
        complianceScore: savedReport.complianceScore,
      },
    });

    return savedReport;
  }

  // Update a report
  async update(id: number, updateData: Partial<ComplianceReport>): Promise<ComplianceReport> {
    await this.complianceReportRepository.update(id, updateData);
    return this.findOne(id);
  }

  // Delete a report
  async delete(id: number): Promise<void> {
    await this.complianceReportRepository.delete(id);
  }
}