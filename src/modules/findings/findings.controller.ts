import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Res,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { FindingsService } from './findings.service';
import { Response } from 'express';
import { PdfService } from '@/shared/services/pdf.service';
import { ChecklistService } from '../checklist/checklist.service';
import { User } from '@/common/decorators/user.decorator';

@Controller('findings')
export class FindingsController {
  private readonly logger = new Logger(FindingsController.name);

  constructor(
    private readonly findingsService: FindingsService,
    private readonly checklistService: ChecklistService,
    private readonly pdfService: PdfService,
  ) { }

  @Get('search')
  async findByTags(
    @User() user,
    @Query('tags') tags: string,
    @Query('severity') severity?: string,
    @Query('category') category?: string,
    @Query('reportId') reportId?: string,
  ) {
    this.logger.log(`Starting findings search for user ${user.id}`, {
      tags,
      severity,
      category,
      reportId
    });

    try {
      const tagArray = tags?.split(',') ?? [];
      const report = reportId ? parseInt(reportId, 10) : undefined;

      const findings = await this.findingsService.findFindingsByTags(user, {
        tags: tagArray,
        severity,
        category,
        reportId: report,
      });

      this.logger.log(`Successfully found ${findings.length} findings for user ${user.id}`);
      return findings;
    } catch (error) {
      this.logger.error(`Failed to search findings for user ${user.id}`, error.stack);
      throw new InternalServerErrorException('Failed to search findings');
    }
  }

  @Get('tags')
  async getTagCounts(@User() user) {
    this.logger.log(`Starting tag counts fetch for user ${user.id}`);

    try {
      const tagCounts = await this.findingsService.getTagCounts(user);
      this.logger.log(`Successfully fetched tag counts for user ${user.id}`);
      return tagCounts;
    } catch (error) {
      this.logger.error(`Failed to fetch tag counts for user ${user.id}`, error.stack);
      throw new InternalServerErrorException('Failed to fetch tag counts');
    }
  }

  @Get(':id/grouped')
  async getGroupedFindings(@Param('id') id: number, @User() user) {
    this.logger.log(`Starting grouped findings fetch for report ${id} by user ${user.id}`);

    try {
      const groupedFindings = await this.findingsService.groupFindingsByControl(id, user);
      this.logger.log(`Successfully fetched grouped findings for report ${id} by user ${user.id}`);
      return groupedFindings;
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.warn(`Report ${id} not found for grouped findings by user ${user.id}`);
        throw error;
      }
      this.logger.error(`Failed to fetch grouped findings for report ${id} by user ${user.id}`, error.stack);
      throw new InternalServerErrorException('Failed to fetch grouped findings');
    }
  }

  @Get('tags/explanations')
  async getTags(@Query('tags') tags: string[]) {
    this.logger.log('Starting tag explanations fetch');

    try {
      const explanation = await this.findingsService.fetchTags(tags);
      this.logger.log('Successfully fetched tag explanations');
      return explanation;
    } catch (error) {
      this.logger.error('Failed to fetch tag explanations', error.stack);
      throw new InternalServerErrorException('Failed to generate tag explanation');
    }
  }

  @Get('checklist/:id')
  async getChecklist(@Param('id') id: number, @User() user) {
    this.logger.log(`Starting checklist fetch for report ${id} by user ${user.id}`);

    try {
      const checklist = await this.findingsService.generateControlChecklistForReport(id, user);
      this.logger.log(`Successfully fetched checklist for report ${id} by user ${user.id}`);
      return checklist;
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.warn(`Report ${id} not found for checklist by user ${user.id}`);
        throw error;
      }
      this.logger.error(`Failed to fetch checklist for report ${id} by user ${user.id}`, error.stack);
      throw new InternalServerErrorException('Failed to fetch checklist');
    }
  }

  @Get('checklist/:id/pdf')
  async exportChecklistPdf(@Param('id') id: number, @Res() res: Response, @User() user) {
    this.logger.log(`Starting checklist PDF export for report ${id} by user ${user.id}`);

    try {
      const checklist = await this.findingsService.generateControlChecklistForReport(id, user);
      const metrics = await this.checklistService.getChecklistMetrics(id, user);
      const report = await this.findingsService.getFullReport(id);

      const tagCounts = report.findings
        .flatMap(f => f.tags || [])
        .reduce((acc, tag) => {
          acc[tag] = (acc[tag] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

      const buffer = await this.pdfService.generateChecklistPDF({
        checklist,
        summary: {
          complianceScore: report.complianceScore ?? 0,
          completion: metrics.completion,
          resolved: metrics.resolved,
          unresolved: metrics.unresolved,
          inProgress: metrics.inProgress,
          tagCounts,
        },
      });

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=control-checklist.pdf`,
      });

      this.logger.log(`Successfully exported checklist PDF for report ${id} by user ${user.id}`);
      res.send(buffer);
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.warn(`Report ${id} not found for checklist PDF export by user ${user.id}`);
        throw error;
      }
      this.logger.error(`Failed to export checklist PDF for report ${id} by user ${user.id}`, error.stack);
      throw new InternalServerErrorException('Failed to export checklist PDF');
    }
  }

  @Get(':id')
  async getFindingsForReport(@Param('id') id: number, @User() user) {
    this.logger.log(`Starting findings fetch for report ${id} by user ${user.id}`);

    try {
      const findings = await this.findingsService.getFindingsForReport(+id, user);
      this.logger.log(`Successfully fetched findings for report ${id} by user ${user.id}`);
      return findings;
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.warn(`Report ${id} not found for findings by user ${user.id}`);
        throw error;
      }
      this.logger.error(`Failed to fetch findings for report ${id} by user ${user.id}`, error.stack);
      throw new InternalServerErrorException('Failed to fetch findings');
    }
  }
}
