// entities/compliance-control.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, JoinTable } from 'typeorm';
import { ControlTopic } from './control-topic.entity';

@Entity()
export class ComplianceControl {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  controlId: string; // e.g. SOC2-CC6.1

  @Column()
  framework: string; // e.g. SOC2, ISO27001

  @Column()
  title: string; // short label

  @Column('text')
  description: string; // full control explanation

  @Column('text', { array: true, nullable: true, default: [] })
  mappedControls: string[];

  @ManyToMany(() => ControlTopic, (topic) => topic.controls, { cascade: true })
  @JoinTable()
  topics: ControlTopic[];

  @Column('float', { array: true, nullable: true })
  embedding: number[];
}
