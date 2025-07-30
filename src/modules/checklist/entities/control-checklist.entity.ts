import { ComplianceReport } from '@/modules/compliance/entities/compliance-report.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';

export enum ChecklistStatus {
  UNRESOLVED = 'unresolved',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
}

@Entity()
export class ControlChecklistItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  controlId: string;

  @Column({
    type: 'enum',
    enum: ChecklistStatus,
    default: ChecklistStatus.UNRESOLVED,
  })
  status: ChecklistStatus;

  @Column()
  projectId: number;

  @Column({ nullable: true })
  assignedTo: string;

  @Column({ type: 'timestamp', nullable: true })
  dueDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  statusUpdatedAt: Date;

  @ManyToOne(() => ComplianceReport, (report) => report.checklistItems, {
    onDelete: 'CASCADE',
  })
  report: ComplianceReport;
}
