// modules/project/entities/project.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ComplianceReport } from '@/modules/compliance/entities/compliance-report.entity';
import { User } from '@/modules/auth/entities/user.entity';
import { Integration } from '@/modules/integrations/entities/integration.entity';

@Entity()
export class Project {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @OneToMany(() => ComplianceReport, report => report.project)
  reports: ComplianceReport[];

  @ManyToMany(() => User, user => user.projects)
  users: User[];

  @OneToMany(() => Integration, (integration) => integration.project)
  integrations: Integration[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
