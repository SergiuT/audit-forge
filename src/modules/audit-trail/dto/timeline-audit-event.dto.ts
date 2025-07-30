// audit-trail/dto/timeline-audit-event-response.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { AuditEventResponseDto } from './audit-event.dto';

export class AuditEventGroupDto {
  @ApiProperty()
  date: string;

  @ApiProperty({ type: [AuditEventResponseDto] })
  events: AuditEventResponseDto[];
}

export class PaginatedTimelineAuditEventResponseDto {
  @ApiProperty({ type: [AuditEventGroupDto] })
  data: AuditEventGroupDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageCount: number;
}
