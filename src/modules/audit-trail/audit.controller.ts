// src/audit/audit-trail.controller.ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { AuditTrailService } from './audit.service';
import { GetEventsQueryDto } from './dto/get-events-query.dto';

@UseGuards(JwtAuthGuard)
@Controller('audit-trail')
export class AuditTrailController {
  constructor(private readonly auditTrailService: AuditTrailService) {}

  @Get()
  async getEvents(@Query() filters: GetEventsQueryDto) {
    return this.auditTrailService.getEvents(filters);
  }

  @Get('/timeline')
  async getTimelineEvents(@Query() filters: GetEventsQueryDto) {
    return this.auditTrailService.getGroupedEvents(filters);
  }
}
