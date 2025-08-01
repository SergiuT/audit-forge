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
  constructor(
    private readonly complianceService: ComplianceService,
    private readonly reportService: ComplianceReportService,
    private readonly nvdService: NvdService,
  ) {}

  @Get()
  async findAll(@User() user) {
    return this.reportService.findAll(user);
  }

  @Get(':id')
  async findOne(@Param('id') id: number, @User() user) {
    return this.reportService.findOne(id, user);
  }

  @Get(':id/findings/filter')
  async filterFindings(
    @Param('id') reportId: number,
    @Query() filters: FilterFindingsDto,
    @User() user,
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

    return this.complianceService.filterFindings(reportId, { controlIds, severity: severities, topicTags: tags }, user);
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
    const { rules, pagination } = await this.nvdService.getNvdRules({ severity: severity as SeverityOptions, fromDate, toDate, category, cveId, page, limit });
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
    if (!file) {
      throw new Error('File is required');
    }
    return this.complianceService.create(createComplianceReportDto, file, user, undefined);
  }

  @Get(':id/export-pdf')
  async exportPdf(@Param('id') id: number, @Res() res: Response, @User() user) {
    const pdf = await this.complianceService.generatePDF(id, user);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=report-${id}.pdf`,
    });

    res.send(pdf);
  }

  @Post(':id/summary')
  async generateSummary(
    @Param('id') id: number,
    @Query('regenerate') regenerate: string,
    @Query('tone') tone: 'executive' | 'technical' | 'remediation' | 'educational' | undefined,
    @User() user,
  ) {
    const shouldRegenerate = regenerate === 'true';
    return this.complianceService.generateSummary(id, shouldRegenerate, tone, user);
  }

  @Get('project/:projectId/reports')
  findReportsByProject(@Param('projectId') projectId: number) {
    return this.complianceService.getReportsForProject(projectId);
  }

  @Post(':id')
  async update(@Param('id') id: number, @Body() updateReportDto: any, @User() user) {
    return this.reportService.update(id, updateReportDto, user);
  }

  @Delete(':id')
  async remove(@Param('id') id: number, @User() user) {
    return this.reportService.delete(id, user);
  }
}
