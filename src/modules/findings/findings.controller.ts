import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import { FindingsService } from './findings.service';
import { Response } from 'express';
import { PdfService } from '@/shared/services/pdf.service';
import { ChecklistService } from '../checklist/checklist.service';

@Controller('findings')
export class FindingsController {
  constructor(
    private readonly findingsService: FindingsService,
    private readonly checklistService: ChecklistService,
    private readonly pdfService: PdfService,
  ) {}

  @Get('search')
  async findByTags(
    @Query('tags') tags: string,
    @Query('severity') severity?: string,
    @Query('category') category?: string,
    @Query('reportId') reportId?: string,
  ) {
    const tagArray = tags?.split(',') ?? [];
    const report = reportId ? parseInt(reportId, 10) : undefined;

    return this.findingsService.findFindingsByTags({
      tags: tagArray,
      severity,
      category,
      reportId: report,
    });
  }

  @Get('tags')
  async getTagCounts() {
    return this.findingsService.getTagCounts();
  }

  @Get(':id/grouped')
  async getGroupedFindings(@Param('id') id: number) {
    return this.findingsService.groupFindingsByControl(id);
  }

  @Get('tags/:tag/explanation')
  async explainTag(@Query('regenerate') regenerate: string, @Param('tag') tag: string) {
    return this.findingsService.getTagExplanation(tag, regenerate === 'true');
  }

  @Get('checklist/:id')
  async getChecklist(@Param('id') id: number) {
    return this.findingsService.generateControlChecklistForReport(id);
  }

  @Get('checklist/:id/pdf')
  async exportChecklistPdf(@Param('id') id: number, @Res() res: Response) {
    const checklist = await this.findingsService.generateControlChecklistForReport(id);
    const metrics = await this.checklistService.getChecklistMetrics(id);
    const report = await this.findingsService.getFullReport(id);

    const tagCounts = report.findings
    .flatMap(f => f.tags || [])
    .reduce((acc, tag) => {
      acc[tag] = (acc[tag] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('WTF', JSON.stringify(checklist, null, 4))
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

    res.send(buffer);
  }

  @Get(':id')
  async getFindingsForReport(@Param('id') id: number) {
    return this.findingsService.getFindingsForReport(+id);
  }
}
