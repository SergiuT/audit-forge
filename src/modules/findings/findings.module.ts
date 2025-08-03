// modules/compliance/compliance.module.ts
import { Module } from '@nestjs/common';
import { FindingsController } from '../findings/findings.controller';
import { ComplianceFinding } from '../compliance/entities/compliance-finding.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FindingsService } from './findings.service';
import { TagExplanation } from './entities/tag-explanation.entity';
import { OpenAIService } from '@/shared/services/openai.service';
import { PdfService } from '@/shared/services/pdf.service';
import { ComplianceReport } from '../compliance/entities/compliance-report.entity';
import { ControlChecklistItem } from '../checklist/entities/control-checklist.entity';
import { ChecklistService } from '../checklist/checklist.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ComplianceFinding,
      TagExplanation,
      ComplianceReport,
      ControlChecklistItem,
    ]),
  ],
  controllers: [FindingsController],
  providers: [FindingsService, OpenAIService, PdfService, ChecklistService],
})
export class FindingsModule {}
