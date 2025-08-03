import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
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

  @Column()
  findingId: number;

  @ManyToOne(() => ComplianceFinding, (finding) => finding.actions, {
    onDelete: 'CASCADE',
  })
  finding: ComplianceFinding;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
