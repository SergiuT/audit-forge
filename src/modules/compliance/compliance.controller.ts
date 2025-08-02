import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Delete,
  UseInterceptors,
  UploadedFile,
  Query,
  Res,
  Logger,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ComplianceService } from './compliance.service';
import { CreateComplianceReportDto } from './dto/create-compliance-report.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { NvdService } from '@/shared/services/nvd.service';
import { User } from '@/common/decorators/user.decorator';
import { FilterFindingsDto } from './dto/filter-findings.dto';
import { SeverityOptions } from '@/shared/types/types';
import { ComplianceReportService } from './services/compliance-report.service';

@Controller('compliance')
export class ComplianceController {
  private readonly logger = new Logger(ComplianceController.name);

  constructor(
    private readonly complianceService: ComplianceService,
    private readonly reportService: ComplianceReportService,
    private readonly nvdService: NvdService,
  ) { }

  @Get()
  async findAll(@User() user) {
    this.logger.log(`Starting compliance reports fetch for user ${user.id}`);

    try {
      const reports = await this.reportService.findAll(user);
      this.logger.log(`Successfully fetched ${reports.length} compliance reports for user ${user.id}`);
      return reports;
    } catch (error) {
      this.logger.error(`Failed to fetch compliance reports for user ${user.id}`, error.stack);
      throw new InternalServerErrorException('Failed to fetch compliance reports');
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: number, @User() user) {
    this.logger.log(`Starting compliance report fetch for ID ${id} by user ${user.id}`);

    try {
      const report = await this.reportService.findOne(id, user);
      this.logger.log(`Successfully fetched compliance report ${id} for user ${user.id}`);
      return report;
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.warn(`Compliance report ${id} not found for user ${user.id}`);
        throw error;
      }
      this.logger.error(`Failed to fetch compliance report ${id} for user ${user.id}`, error.stack);
      throw new InternalServerErrorException('Failed to fetch compliance report');
    }
  }

  @Get(':id/findings/filter')
  async filterFindings(
    @Param('id') reportId: number,
    @Query() filters: FilterFindingsDto,
    @User() user,
  ) {
    this.logger.log(`Starting findings filter for report ${reportId} by user ${user.id}`, { filters });

    try {
      const controlIds = Array.isArray(filters.controlIds)
        ? filters.controlIds
        : filters.controlIds
          ? [filters.controlIds]
          : [];

      const severities = Array.isArray(filters.severity)
        ? filters.severity
        : filters.severity
          ? [filters.severity]
          : [];

      const tags = Array.isArray(filters.topicTags)
        ? filters.topicTags
        : filters.topicTags
          ? [filters.topicTags]
          : [];

      const filteredFindings = await this.complianceService.filterFindings(
        reportId,
        { controlIds, severity: severities, topicTags: tags },
        user
      );

      this.logger.log(`Successfully filtered findings for report ${reportId}, found ${filteredFindings.length} results`);
      return filteredFindings;
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.warn(`Report ${reportId} not found for filtering by user ${user.id}`);
        throw error;
      }
      this.logger.error(`Failed to filter findings for report ${reportId} by user ${user.id}`, error.stack);
      throw new InternalServerErrorException('Failed to filter findings');
    }
  }

  @Get('rules/nvd')
  async getNvdRules(
    @Query('severity') severity?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('category') category?: string,
    @Query('cveId') cveId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
    this.logger.log(`Starting NVD rules fetch`, { severity, fromDate, toDate, category, cveId, page, limit });

    try {
      const { rules, pagination } = await this.nvdService.getNvdRules({
        severity: severity as SeverityOptions,
        fromDate,
        toDate,
        category,
        cveId,
        page,
        limit
      });

      this.logger.log(`Successfully fetched NVD rules, found ${rules.length} rules`);
      return { rules, pagination };
    } catch (error) {
      this.logger.error(`Failed to fetch NVD rules`, error.stack);
      throw new InternalServerErrorException('Failed to fetch NVD rules');
    }
  }

  @Post('rules/nvd-sync')
  async syncNvdRules() {
    this.logger.log(`🔍 Starting NVD rules sync`);

    try {
      const inserted = await this.nvdService.syncNvdFeedV2();
      this.logger.log(`Successfully synced NVD rules, inserted ${inserted} rules`);
      return { inserted };
    } catch (error) {
      this.logger.error(`Failed to sync NVD rules`, error.stack);
      throw new InternalServerErrorException('Failed to sync NVD rules');
    }
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // Limit file size to 10MB
      fileFilter: (req, file, callback) => {
        if (file.mimetype !== 'text/plain') {
          return callback(new Error('Only .txt files are allowed'), false);
        }
        callback(null, true);
      },
    }),
  )
  async createCompliance(
    @Body() createComplianceReportDto: CreateComplianceReportDto,
    @UploadedFile() file: Express.Multer.File,
    @User() user
  ) {
    this.logger.log(`Starting compliance report creation for user ${user.id}`, {
      projectId: createComplianceReportDto.projectId,
      fileName: file?.originalname,
      fileSize: file?.size
    });

    try {
      if (!file) {
        this.logger.warn(`No file provided for compliance report creation by user ${user.id}`);
        throw new BadRequestException('File is required');
      }

      const report = await this.complianceService.create(createComplianceReportDto, file, user, undefined);
      this.logger.log(`Successfully created compliance report ${report.id} for user ${user.id}`);
      return report;
    } catch (error) {
      if (error instanceof BadRequestException) {
        this.logger.warn(`⚠️ Bad request for compliance report creation by user ${user.id}: ${error.message}`);
        throw error;
      }
      this.logger.error(`Failed to create compliance report for user ${user.id}`, error.stack);
      throw new InternalServerErrorException('Failed to create compliance report');
    }
  }

  @Get(':id/export-pdf')
  async exportPdf(@Param('id') id: number, @Res() res: Response, @User() user) {
    this.logger.log(`Starting PDF export for report ${id} by user ${user.id}`);

    try {
      const pdf = await this.complianceService.generatePDF(id, user);

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=report-${id}.pdf`,
      });

      this.logger.log(`Successfully exported PDF for report ${id} by user ${user.id}`);
      res.send(pdf);
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.warn(`Report ${id} not found for PDF export by user ${user.id}`);
        throw error;
      }
      this.logger.error(`Failed to export PDF for report ${id} by user ${user.id}`, error.stack);
      throw new InternalServerErrorException('Failed to export PDF');
    }
  }

  @Post(':id/summary')
  async generateSummary(
    @Param('id') id: number,
    @Query('regenerate') regenerate: string,
    @Query('tone') tone: 'executive' | 'technical' | 'remediation' | 'educational' | undefined,
    @User() user,
  ) {
    this.logger.log(`Starting summary generation for report ${id} by user ${user.id}`, {
      regenerate,
      tone
    });

    try {
      const shouldRegenerate = regenerate === 'true';
      const summary = await this.complianceService.generateSummary(id, shouldRegenerate, tone, user);
      this.logger.log(`Successfully generated summary for report ${id} by user ${user.id}`);
      return summary;
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.warn(`⚠️ Report ${id} not found for summary generation by user ${user.id}`);
        throw error;
      }
      this.logger.error(`Failed to generate summary for report ${id} by user ${user.id}`, error.stack);
      throw new InternalServerErrorException('Failed to generate summary');
    }
  }

  @Get('project/:projectId/reports')
  async findReportsByProject(@Param('projectId') projectId: number) {
    this.logger.log(`Starting project reports fetch for project ${projectId}`);

    try {
      const reports = await this.complianceService.getReportsForProject(projectId);
      this.logger.log(`Successfully fetched ${reports.length} reports for project ${projectId}`);
      return reports;
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.warn(`Project ${projectId} not found for reports fetch`);
        throw error;
      }
      this.logger.error(`Failed to fetch reports for project ${projectId}`, error.stack);
      throw new InternalServerErrorException('Failed to fetch project reports');
    }
  }

  @Post(':id')
  async update(@Param('id') id: number, @Body() updateReportDto: any, @User() user) {
    this.logger.log(`Starting compliance report update for ID ${id} by user ${user.id}`);

    try {
      const updatedReport = await this.reportService.update(id, updateReportDto, user);
      this.logger.log(`Successfully updated compliance report ${id} by user ${user.id}`);
      return updatedReport;
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.warn(`Report ${id} not found for update by user ${user.id}`);
        throw error;
      }
      this.logger.error(`Failed to update compliance report ${id} by user ${user.id}`, error.stack);
      throw new InternalServerErrorException('Failed to update compliance report');
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: number, @User() user) {
    this.logger.log(`Starting compliance report deletion for ID ${id} by user ${user.id}`);

    try {
      const result = await this.reportService.delete(id, user);
      this.logger.log(`Successfully deleted compliance report ${id} by user ${user.id}`);
      return result;
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.warn(`Report ${id} not found for deletion by user ${user.id}`);
        throw error;
      }
      this.logger.error(`Failed to delete compliance report ${id} by user ${user.id}`, error.stack);
      throw new InternalServerErrorException('Failed to delete compliance report');
    }
  }
}
