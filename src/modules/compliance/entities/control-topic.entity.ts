import { Entity, PrimaryGeneratedColumn, Column, ManyToMany } from 'typeorm';
import { ComplianceControl } from './compliance-control.entity';

@Entity()
export class ControlTopic {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  label: string;

  @Column({ unique: true })
  slug: string;

  @Column({ nullable: true })
  description?: string;

  @Column("float", { array: true })
  embedding: number[];

  @ManyToMany(() => ComplianceControl, (control) => control.topics)
  controls: ComplianceControl[];
}