import { Injectable, InternalServerErrorException, Logger, NotFoundException } from "@nestjs/common";
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
  private readonly logger = new Logger(ComplianceReportService.name);
  constructor(
    @InjectRepository(ComplianceReport)
    private complianceReportRepository: Repository<ComplianceReport>,

    private readonly cacheService: CacheService,
    private readonly fileService: ComplianceFileService,
  ) {}

  // Get all reports
  async findAll(user: User): Promise<ComplianceReport[]> {
    const cacheKey = `reports:user:${user.id}1`;
    // return this.cacheService.getOrSet(cacheKey, () => {
      return this.complianceReportRepository.find({
        where: { project: { id: In(user.projects.map(p => p.id)) } },
        relations: ['project'],
      });
    // }, 300);
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
  async create(reportData: CreateComplianceReportDto): Promise<ComplianceReport> {
    const reportEntity = this.complianceReportRepository.create(reportData);        
    const savedReport = await this.complianceReportRepository.save(reportEntity);

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