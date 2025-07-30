import { PrimaryGeneratedColumn, Column, Entity } from "typeorm";

export enum RuleSource {
  INTERNAL = 'INTERNAL',
  NVD = 'NVD',
  CIS = 'CIS',
  CUSTOM = 'CUSTOM',
}

@Entity()
export class ComplianceRule {
    @PrimaryGeneratedColumn()
    id: number;
  
    @Column()
    rule: string;

    @Column()
    description: string;
  
    @Column()
    severity: 'low' | 'medium' | 'high';

    @Column({ type: 'enum', enum: RuleSource, default: RuleSource.INTERNAL })
    source: RuleSource;

    @Column({ nullable: true })
    cveId?: string;

    @Column({ nullable: true })
    affectedService?: string;
  
    @Column()
    category: string;
  
    @Column('text')
    pattern: string;
  
    @Column('simple-array', { nullable: true })
    tags: string[];
  
    @Column('simple-array', { nullable: true })
    mappedControls: string[];

    @Column({ type: 'jsonb', nullable: true })
    metadata?: Record<string, any>;

    @Column('text', { array: true, nullable: true })
    topicTags: string[];

    @Column('float', { array: true, nullable: true })
    embedding: number[];
  }