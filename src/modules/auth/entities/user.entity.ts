// src/modules/auth/entities/user.entity.ts
import { Integration } from '@/modules/integrations/entities/integration.entity';
import { Project } from '@/modules/project/entities/project.entity';
import { Exclude } from 'class-transformer';
import { Entity, PrimaryGeneratedColumn, Column, BaseEntity, ManyToMany, JoinTable, OneToMany } from 'typeorm';

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}

@Entity('Users')
export class User extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', unique: true })
  username: string;

  @Column({ type: 'varchar', unique: true })
  email: string;

  @Exclude()
  @Column({ type: 'varchar' })
  password: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @ManyToMany(() => Project, project => project.users)
  @JoinTable()
  projects: Project[];

  @OneToMany(() => Integration, (integration) => integration.user)
  integrations: Integration[];
}
