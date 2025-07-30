// modules/compliance/compliance.module.ts
import { Module } from '@nestjs/common';
import { ComplianceFinding } from '../compliance/entities/compliance-finding.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComplianceControl } from '../compliance/entities/compliance-control.entity';
import { ChecklistService } from './checklist.service';
import { ChecklistController } from './checklist-controller';
import { ControlChecklistItem } from './entities/control-checklist.entity';
import { ComplianceReport } from '../compliance/entities/compliance-report.entity';
import { AuditTrailService } from '../audit-trail/audit.service';
import { AuditTrailModule } from '../audit-trail/audit.module';
import { AuditEvent } from '../audit-trail/entities/audit-event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ControlChecklistItem,
      ComplianceFinding,
      ComplianceControl,
      ComplianceReport,
      AuditEvent
    ]),
  ],
  controllers: [ChecklistController],
  providers: [ChecklistService, AuditTrailService],
  exports: [ChecklistService],
})
export class ChecklistModule {}
