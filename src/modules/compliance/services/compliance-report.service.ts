import { AuditTrailService } from "@/modules/audit-trail/audit.service";
import { AuditAction } from "@/modules/audit-trail/entities/audit-event.entity";
import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { ComplianceReport } from "../entities/compliance-report.entity";
import { CacheService } from "@/shared/services/cache.service";
import { CreateComplianceReportDto } from "../dto/create-compliance-report.dto";
import { calculateComplianceScore, getCategoryScores } from "@/shared/utils/compliance-score.util";
import { ComplianceFileService } from "./compliance-file.service";
import { User } from "@/modules/auth/entities/user.entity";

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
  async findAll(user: User): Promise<ComplianceReport[]> {
    const cacheKey = `reports:user:${user.id}`;
    return this.cacheService.getOrSet(cacheKey, () => {
      return this.complianceReportRepository.find({
        where: { project: { id: In(user.projects.map(p => p.id)) } },
        relations: ['findings', 'findings.actions', 'project'],
      });
    }, 1800);
  }

  // Get a report by ID
  async findOne(id: number, user: User): Promise<any> {
    const report = await this.complianceReportRepository.findOne({
      where: { id, userId: user.id },
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
  async update(id: number, updateData: Partial<ComplianceReport>, user: User): Promise<ComplianceReport> {
    await this.complianceReportRepository.update(id, updateData);
    return this.findOne(id, user);
  }

  // Delete a report
  async delete(id: number, user: User): Promise<void> {
    await this.complianceReportRepository.delete({ id, userId: user.id });
  }
}