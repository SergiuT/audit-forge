// src/audit/audit-trail.controller.ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditTrailService } from './audit.service';
import { GetEventsQueryDto } from './dto/get-events-query.dto';
import { User } from '@/common/decorators/user.decorator';

@Controller('audit-trail')
export class AuditTrailController {
  constructor(private readonly auditTrailService: AuditTrailService) {}

  @Get()
  async getEvents(@Query() filters: GetEventsQueryDto, @User('id') userId: string) {
    return this.auditTrailService.getEvents(filters, userId);
  }

  @Get('/timeline')
  async getTimelineEvents(@Query() filters: GetEventsQueryDto, @User('id') userId: string) {
    return this.auditTrailService.getGroupedEvents(filters, userId);
  }
}
