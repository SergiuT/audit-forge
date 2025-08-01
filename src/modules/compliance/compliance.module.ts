// modules/compliance/compliance.module.ts
import { Module } from '@nestjs/common';
import { ComplianceService } from './compliance.service';
import { ComplianceController } from './compliance.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComplianceReport } from './entities/compliance-report.entity';
import { S3Service } from '@/shared/services/s3.service';
import { ComplianceFinding } from './entities/compliance-finding.entity';
import { ComplianceAction } from './entities/compliance-action.entity';
import { OpenAIService } from '@/shared/services/openai.service';
import { PdfService } from '@/shared/services/pdf.service';
import { ChecklistModule } from '../checklist/checklist.module';
import { ComplianceRule } from './entities/compliance-rule.entity';
import { Project } from '../project/entities/project.entity';
import { NvdService } from '@/shared/services/nvd.service';
import { ControlTopic } from './entities/control-topic.entity';
import { AuditTrailService } from '../audit-trail/audit.service';
import { AuditEvent } from '../audit-trail/entities/audit-event.entity';
import { ComplianceReportService } from './services/compliance-report.service';
import { ComplianceAnalysisService } from './services/compliance-analysis.service';
import { ComplianceDriftService } from './services/compliance-drift.service';
import { ComplianceFileService } from './services/compliance-file.service';
import { ComplianceAIService } from './services/compliance-ai.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ComplianceReport,
      ComplianceFinding,
      ComplianceAction,
      ComplianceRule,
      ControlTopic,
      Project,
      AuditEvent
    ]),
    ChecklistModule,
  ],
  controllers: [ComplianceController],
  providers: [
    ComplianceService,
    S3Service,
    OpenAIService,
    PdfService,
    NvdService,
    AuditTrailService,
    ComplianceReportService,
    ComplianceAnalysisService,
    ComplianceDriftService,
    ComplianceFileService,
    ComplianceAIService,
  ],
  exports: [ComplianceService]
})
export class ComplianceModule { }
