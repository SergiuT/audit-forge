// modules/compliance/compliance.module.ts
import { Module } from '@nestjs/common';
import { FindingsController } from '../findings/findings.controller';
import { ComplianceFinding } from '../compliance/entities/compliance-finding.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FindingsService } from './findings.service';
import { TagExplanation } from './entities/tag-explanation.entity';
import { OpenAIService } from '@/shared/services/openai.service';
import { ComplianceControl } from '../compliance/entities/compliance-control.entity';
import { PdfService } from '@/shared/services/pdf.service';
import { ComplianceReport } from '../compliance/entities/compliance-report.entity';
import { ControlChecklistItem } from '../checklist/entities/control-checklist.entity';
import { ChecklistService } from '../checklist/checklist.service';
import { AuditTrailModule } from '../audit-trail/audit.module';
import { AuditTrailService } from '../audit-trail/audit.service';
import { AuditEvent } from '../audit-trail/entities/audit-event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ComplianceFinding,
      TagExplanation,
      ComplianceControl,
      ComplianceReport,
      ControlChecklistItem,
      AuditEvent
    ]),
  ],
  controllers: [FindingsController],
  providers: [FindingsService, OpenAIService, PdfService, ChecklistService, AuditTrailService],
})
export class FindingsModule {}
