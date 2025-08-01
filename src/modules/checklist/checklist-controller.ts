import { Body, Controller, Get, Param, Patch, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ChecklistService } from './checklist.service';
import { Response } from 'express';
import { ChecklistStatus } from './entities/control-checklist.entity';
import { User } from '@/common/decorators/user.decorator';

@Controller('checklist')
export class ChecklistController {
  constructor(private readonly checklistService: ChecklistService) {}

  @Get('report/:reportId')
  async getChecklistForReport(@Param('reportId') reportId: number) {
    return this.checklistService.getChecklistWithStatuses(+reportId);
  }

  @Get('report/:reportId/metrics')
  async getChecklistMetrics(@Param('reportId') reportId: number) {
    return this.checklistService.getChecklistMetrics(+reportId);
  }

  @Get('report/:reportId/prioritized-controls')
  async getPrioritized(@Param('reportId') reportId: number) {
    return this.checklistService.getPrioritizedControls(reportId);
  }

  @Get('report/:reportId/export')
  async exportChecklist(
    @Param('reportId') reportId: number,
    @Res() res: Response,
  ) {
    const csv = await this.checklistService.exportChecklistCSV(
      +reportId,
    )
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="checklist-report-${reportId}.csv"`,
    );
  
    return res.send(csv);
  }

  @Patch('report/:reportId/control/:controlId')
  async updateChecklistItem(
    @Param('reportId') reportId: number,
    @Param('controlId') controlId: string,
    @Body()
    update: {
      assignedTo?: string;
      dueDate?: string;
      status?: ChecklistStatus;
    },
    @User('id') userId: string
  ) {
    const parsedDate = update.dueDate ? new Date(update.dueDate) : undefined;

    return this.checklistService.updateChecklistItem(userId, +reportId, controlId, {
      ...update,
      dueDate: parsedDate,
    });
  }
}
