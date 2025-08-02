// src/audit/audit-trail.controller.ts
import { Controller, Get, Query, UseGuards, Logger, InternalServerErrorException } from '@nestjs/common';
import { AuditTrailService } from './audit.service';
import { GetEventsQueryDto } from './dto/get-events-query.dto';
import { User } from '@/common/decorators/user.decorator';

@Controller('audit-trail')
export class AuditTrailController {
  private readonly logger = new Logger(AuditTrailController.name);

  constructor(private readonly auditTrailService: AuditTrailService) { }

  @Get()
  async getEvents(@Query() filters: GetEventsQueryDto, @User('id') userId: string) {
    this.logger.log(`Starting audit events fetch for user ${userId}`, { filters });

    try {
      const events = await this.auditTrailService.getEvents(filters, userId);
      this.logger.log(`Successfully fetched ${events.data.length} audit events for user ${userId}`);
      return events;
    } catch (error) {
      this.logger.error(`Failed to fetch audit events for user ${userId}`, error.stack);
      throw new InternalServerErrorException('Failed to fetch audit events');
    }
  }

  @Get('/timeline')
  async getTimelineEvents(@Query() filters: GetEventsQueryDto, @User('id') userId: string) {
    this.logger.log(`Starting timeline events fetch for user ${userId}`, { filters });

    try {
      const timelineEvents = await this.auditTrailService.getGroupedEvents(filters, userId);
      this.logger.log(`Successfully fetched timeline events for user ${userId}`);
      return timelineEvents;
    } catch (error) {
      this.logger.error(`Failed to fetch timeline events for user ${userId}`, error.stack);
      throw new InternalServerErrorException('Failed to fetch timeline events');
    }
  }
}
