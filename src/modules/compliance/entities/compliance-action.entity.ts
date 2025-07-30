// entities/compliance-action.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { ComplianceFinding } from './compliance-finding.entity';

@Entity()
export class ComplianceAction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  recommendation: string;

  @Column({ default: 'pending' })
  status: 'pending' | 'resolved';

  @Column()
  projectId: number;

  @ManyToOne(() => ComplianceFinding, (finding) => finding.actions, { onDelete: 'CASCADE' })
  finding: ComplianceFinding;
}
