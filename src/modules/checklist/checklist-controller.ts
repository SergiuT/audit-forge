import { Body, Controller, Get, Param, Patch, Query, Req, Res, UseGuards, Logger, NotFoundException, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { ChecklistService } from './checklist.service';
import { Response } from 'express';
import { ChecklistStatus } from './entities/control-checklist.entity';
import { User } from '@/common/decorators/user.decorator';

@Controller('checklist')
export class ChecklistController {
  private readonly logger = new Logger(ChecklistController.name);

  constructor(private readonly checklistService: ChecklistService) { }

  @Get('report/:reportId')
  async getChecklistForReport(@Param('reportId') reportId: number, @User() user) {
    this.logger.log(`Starting checklist fetch for report ${reportId} by user ${user.id}`);

    try {
      const checklist = await this.checklistService.getChecklistWithStatuses(reportId, user);
      this.logger.log(`Successfully fetched checklist for report ${reportId} by user ${user.id}`);
      return checklist;
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.warn(`Report ${reportId} not found for checklist by user ${user.id}`);
        throw error;
      }
      this.logger.error(`Failed to fetch checklist for report ${reportId} by user ${user.id}`, error.stack);
      throw new InternalServerErrorException('Failed to fetch checklist');
    }
  }

  @Get('report/:reportId/metrics')
  async getChecklistMetrics(@Param('reportId') reportId: number, @User() user) {
    this.logger.log(`Starting checklist metrics fetch for report ${reportId} by user ${user.id}`);

    try {
      const metrics = await this.checklistService.getChecklistMetrics(reportId, user);
      this.logger.log(`Successfully fetched checklist metrics for report ${reportId} by user ${user.id}`);
      return metrics;
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.warn(`Report ${reportId} not found for checklist metrics by user ${user.id}`);
        throw error;
      }
      this.logger.error(`Failed to fetch checklist metrics for report ${reportId} by user ${user.id}`, error.stack);
      throw new InternalServerErrorException('Failed to fetch checklist metrics');
    }
  }

  @Get('report/:reportId/prioritized-controls')
  async getPrioritized(@Param('reportId') reportId: number, @User() user) {
    this.logger.log(`Starting prioritized controls fetch for report ${reportId} by user ${user.id}`);

    try {
      const prioritizedControls = await this.checklistService.getPrioritizedControls(reportId, user);
      this.logger.log(`Successfully fetched prioritized controls for report ${reportId} by user ${user.id}`);
      return prioritizedControls;
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.warn(`Report ${reportId} not found for prioritized controls by user ${user.id}`);
        throw error;
      }
      this.logger.error(`Failed to fetch prioritized controls for report ${reportId} by user ${user.id}`, error.stack);
      throw new InternalServerErrorException('Failed to fetch prioritized controls');
    }
  }

  @Get('report/:reportId/export')
  async exportChecklist(
    @Param('reportId') reportId: number,
    @Res() res: Response,
    @User() user
  ) {
    this.logger.log(`Starting checklist export for report ${reportId} by user ${user.id}`);

    try {
      const csv = await this.checklistService.exportChecklistCSV(
        reportId,
        user,
      );

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="checklist-report-${reportId}.csv"`,
      );

      this.logger.log(`Successfully exported checklist CSV for report ${reportId} by user ${user.id}`);
      return res.send(csv);
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.warn(`Report ${reportId} not found for checklist export by user ${user.id}`);
        throw error;
      }
      this.logger.error(`Failed to export checklist CSV for report ${reportId} by user ${user.id}`, error.stack);
      throw new InternalServerErrorException('Failed to export checklist CSV');
    }
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
    @User() user
  ) {
    this.logger.log(`Starting checklist item update for report ${reportId}, control ${controlId} by user ${user.id}`, { update });

    try {
      const parsedDate = update.dueDate ? new Date(update.dueDate) : undefined;

      const updatedItem = await this.checklistService.updateChecklistItem(user.id, +reportId, controlId, {
        ...update,
        dueDate: parsedDate,
      });

      this.logger.log(`Successfully updated checklist item for report ${reportId}, control ${controlId} by user ${user.id}`);
      return updatedItem;
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.warn(`Report ${reportId} or control ${controlId} not found for update by user ${user.id}`);
        throw error;
      }
      if (error instanceof BadRequestException) {
        this.logger.warn(`Bad request for checklist item update by user ${user.id}: ${error.message}`);
        throw error;
      }
      this.logger.error(`Failed to update checklist item for report ${reportId}, control ${controlId} by user ${user.id}`, error.stack);
      throw new InternalServerErrorException('Failed to update checklist item');
    }
  }
}
