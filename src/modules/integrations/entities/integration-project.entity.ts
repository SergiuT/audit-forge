import {
    Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, CreateDateColumn
} from 'typeorm';
import { Integration, IntegrationType } from './integration.entity';
import { ComplianceReport } from '../../compliance/entities/compliance-report.entity';
  
  
@Entity()
export class IntegrationProject {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'enum', enum: IntegrationType, enumName: 'integration_type_enum' })
    type: IntegrationType;

    @Column()
    name: string;

    @Column()
    externalId: string; // repo full_name, GCP projectId, AWS accountId

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, any>; // tags, labels, org name, etc.

    @ManyToOne(() => Integration, integration => integration.projects, { onDelete: 'CASCADE' })
    integration: Integration;

    @Column()
    integrationId: string;

    @OneToMany(() => ComplianceReport, report => report.integrationProject, { cascade: true, onDelete: 'CASCADE' })
    reports: ComplianceReport[];

    @CreateDateColumn()
    createdAt: Date;

    @Column({ type: 'timestamp', nullable: true })
    lastScannedAt: Date;

    @Column({ type: 'bigint', nullable: true })
    lastRunId: number;

    @Column({ type: 'text', nullable: true })
    lastLogTimestamp?: string;

    @Column({ default: true })
    includedInScans?: boolean;
}