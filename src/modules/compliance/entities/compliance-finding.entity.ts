// entities/compliance-finding.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { ComplianceReport } from './compliance-report.entity';
import { ComplianceAction } from './compliance-action.entity';

@Entity()
export class ComplianceFinding {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  rule: string;

  @Column()
  description: string;

  @Column()
  projectId: number;

  @Column()
  severity: 'low' | 'medium' | 'high';

  @OneToMany(() => ComplianceAction, (action) => action.finding)
  actions: ComplianceAction[];

  @Column()
  category: string;

  @Column('text', { array: true, default: [] })
  tags: string[];

  @Column('text', { array: true, default: [] })
  mappedControls: string[];

  @ManyToOne(() => ComplianceReport, (report) => report.findings, {
    onDelete: 'CASCADE',
  })
  report: ComplianceReport;
}
