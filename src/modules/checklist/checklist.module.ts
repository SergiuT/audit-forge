// modules/compliance/compliance.module.ts
import { Module } from '@nestjs/common';
import { ComplianceFinding } from '../compliance/entities/compliance-finding.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChecklistService } from './checklist.service';
import { ChecklistController } from './checklist-controller';
import { ControlChecklistItem } from './entities/control-checklist.entity';
import { ComplianceReport } from '../compliance/entities/compliance-report.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ControlChecklistItem,
      ComplianceFinding,
      ComplianceReport,
    ]),
  ],
  controllers: [ChecklistController],
  providers: [ChecklistService],
  exports: [ChecklistService],
})
export class ChecklistModule {}
