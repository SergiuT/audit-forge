// modules/compliance/entities/compliance-report.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, BaseEntity, OneToMany, ManyToOne } from 'typeorm';
import { ComplianceFinding } from './compliance-finding.entity';
import { ControlChecklistItem } from '@/modules/checklist/entities/control-checklist.entity';
import { ReportSource } from '@/shared/types/types';
import { Project } from '@/modules/project/entities/project.entity';
import { IntegrationProject } from '@/modules/integrations/entities/integration-project.entity';
import { ScannedDependency } from '@/modules/integrations/entities/scanned-dependency.entity';

@Entity()
export class ComplianceReport extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column("jsonb")
  reportData: object;

  @Column({ default: 'pending' })
  status: string;

  @Column()
  fileDataKey: string;

  @Column({ nullable: true })
  source: ReportSource;

  @Column({ type: 'timestamp', nullable: true })
  aiSummaryGeneratedAt: Date;

  @Column({ type: 'text', nullable: true })
  aiSummary: string;

  @Column({ type: 'int', nullable: true })
  complianceScore: number;

  @Column({ type: 'jsonb', nullable: true })
  categoryScores: Record<string, number>;

  @OneToMany(() => ComplianceFinding, (finding) => finding.report)
  findings: ComplianceFinding[];

  @OneToMany(() => ControlChecklistItem, (item) => item.report)
  checklistItems: ControlChecklistItem[];

  @ManyToOne(() => IntegrationProject, project => project.reports, { nullable: true })
  integrationProject: IntegrationProject;

  @Column({ nullable: true })
  integrationProjectId: string;

  @Column({ type: 'jsonb', nullable: true })
  controlScores?: Record<string, number>;

  @ManyToOne(() => Project, (project) => project.reports, { nullable: true })
  project: Project;

  @OneToMany(() => ScannedDependency, (dep) => dep.report)
  dependencies: ScannedDependency[];

  @Column({ type: 'jsonb', nullable: true })
  driftComparison?: {
    newFindings: string[];        // rule ids or hashes
    resolvedFindings: string[];
    unchangedFindings: string[];
    scoreDelta: number;           // e.g. +5, -12
    categoryScoreDelta: Record<string, number>;
    controlScoreDelta: Record<string, number>;
  };

  @Column({ type: 'text', nullable: true })
  driftSummary?: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
