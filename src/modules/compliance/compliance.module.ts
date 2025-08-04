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
import { ComplianceReportService } from './services/compliance-report.service';
import { ComplianceDriftService } from './services/compliance-drift.service';
import { ComplianceFileService } from './services/compliance-file.service';
import { ComplianceAIService } from './services/compliance-ai.service';
import { AIAgentService } from '../ai-agents/ai-agent.service';
import { FindingsModule } from '../findings/findings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ComplianceReport,
      ComplianceFinding,
      ComplianceAction,
      ComplianceRule,
      Project
    ]),
    ChecklistModule,
    FindingsModule
  ],
  controllers: [ComplianceController],
  providers: [
    ComplianceService,
    S3Service,
    OpenAIService,
    PdfService,
    NvdService,
    ComplianceReportService,
    ComplianceDriftService,
    ComplianceFileService,
    ComplianceAIService,
    AIAgentService
  ],
  exports: [ComplianceService]
})
export class ComplianceModule { }
