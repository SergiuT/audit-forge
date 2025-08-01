// modules/integrations/entities/integration.entity.ts
import { User } from '@/modules/auth/entities/user.entity';
import { Project } from '@/modules/project/entities/project.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { IntegrationProject } from './integration-project.entity';

export enum IntegrationType {
  GCP = 'gcp',
  AWS = 'aws',
  GITHUB = 'github',
  CLOUDFLARE = 'cloudflare',
  GRAFANA = 'grafana',
  OTHER = 'other',
}

@Entity()
export class Integration {
    @PrimaryGeneratedColumn('uuid')
    id: string;
  
    @Column({ type: 'enum', enum: IntegrationType, enumName: 'integration_type' })
    type: IntegrationType;
  
    @Column()
    name: string;
  
    @Column()
    projectId: string;
  
    @ManyToOne(() => Project, project => project.integrations)
    project: Project;
  
    @Column()
    userId: number;
  
    @ManyToOne(() => User, user => user.integrations)
    user: User;

    @OneToMany(() => IntegrationProject, project => project.integration, { cascade: true, onDelete: 'CASCADE' })
    projects: IntegrationProject[];
  
    @Column({ type: 'text' })
    credentials: string; // Either AES-encrypted string or Secrets Manager key
  
    @Column({ default: false })
    useManager: boolean;
  
    @CreateDateColumn()
    createdAt: Date;
  
    @UpdateDateColumn()
    updatedAt: Date;

    @Column({ nullable: true })
    assumeRoleArn: string;

    @Column({ nullable: true })
    externalId: string;
  }
