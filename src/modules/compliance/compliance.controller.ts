// modules/compliance/compliance.controller.ts
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Delete,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Query,
  Res,
} from '@nestjs/common';
import { ComplianceService } from './compliance.service';
import { CreateComplianceReportDto } from './dto/create-compliance-report.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ProjectAccessGuard } from '../auth/guards/access.guard';
import { NvdService } from '@/shared/services/nvd.service';
import { User } from '@/common/decorators/user.decorator';
import { FilterFindingsDto } from './dto/filter-findings.dto';
import { RateLimitGuard } from '@/common/guards/rate-limit.guard';
import { RateLimit } from '@/common/decorators/rate-limit.decorator';
import { SeverityOptions } from '@/shared/types/types';

@UseGuards(JwtAuthGuard)
@Controller('compliance')
export class ComplianceController {
  constructor(
    private readonly complianceService: ComplianceService,
    private readonly nvdService: NvdService,
  ) {}

  @Get()
  @UseGuards(RateLimitGuard)
  @RateLimit({
    windowMs: 60 * 1000,
    maxRequests: 30,
    type: 'user'
  })
  async findAll() {
    return this.complianceService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: number) {
    return this.complianceService.findOne(id);
  }

  @Get(':id/findings/filter')
  async filterFindings(
    @Param('id') reportId: number,
    @Query() filters: FilterFindingsDto
  ) {
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

    return this.complianceService.filterFindings(reportId, { controlIds, severity: severities, topicTags: tags });
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
    const { rules, pagination } = await this.complianceService.getNvdRules({ severity: severity as SeverityOptions, fromDate, toDate, category, cveId, page, limit });
    return { rules, pagination };
  }  

  @Get('topics/controls')
  async getControlTopics() {
    return this.complianceService.findAllControlTopics();
  }

  @Post('rules/nvd-sync')
  async syncNvdRules() {
    const inserted = await this.nvdService.syncNvdFeedV2();
    return { inserted };
  }

  @Post()
  @UseGuards(RateLimitGuard)
  @RateLimit({
    windowMs: 5 * 60 * 1000,
    maxRequests: 3,
    type: 'user'
  })
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
    @User('id') userId: string
  ) {
    if (!file) {
      throw new Error('File is required');
    }
    return this.complianceService.create(createComplianceReportDto, Number(userId), file);
  }

  @Get(':id/export-pdf')
  async exportPdf(@Param('id') id: number, @Res() res: Response) {
    const pdf = await this.complianceService.generatePDF(id);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=report-${id}.pdf`,
    });

    res.send(pdf);
  }

  @Post(':id/summary')
  @UseGuards(RateLimitGuard)
  @RateLimit({
    windowMs: 5 * 60 * 1000,
    maxRequests: 3,
    type: 'user'
  })
  async generateSummary(
    @Param('id') id: number,
    @Query('regenerate') regenerate: string,
    @Query('tone') tone: 'executive' | 'technical' | 'remediation' | 'educational' | undefined,
  ) {
    const shouldRegenerate = regenerate === 'true';
    return this.complianceService.generateSummary(id, shouldRegenerate, tone);
  }

  @UseGuards(ProjectAccessGuard)
  @Get('project/:projectId/reports')
  findReportsByProject(@Param('projectId') projectId: number) {
    return this.complianceService.getReportsForProject(projectId);
  }

  @Post(':id')
  async update(@Param('id') id: number, @Body() updateReportDto: any) {
    return this.complianceService.update(id, updateReportDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: number) {
    return this.complianceService.delete(id);
  }
}
