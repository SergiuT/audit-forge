// src/modules/auth/entities/user.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, BaseEntity, ManyToMany, JoinTable, OneToMany } from 'typeorm';
import { Exclude } from 'class-transformer';
import { Project } from '@/modules/project/entities/project.entity';
import { Integration } from '@/modules/integrations/entities/integration.entity';
import { RefreshToken } from './refresh-token.entity';

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
  @JoinTable({
    name: 'users_projects',
    joinColumn: {
      name: 'usersId',
      referencedColumnName: 'id'
    },
    inverseJoinColumn: {
      name: 'projectId', 
      referencedColumnName: 'id'
    }
  })
  projects: Project[];

  @OneToMany(() => Integration, (integration) => integration.user)
  integrations: Integration[];

  @OneToMany(() => RefreshToken, (refreshToken) => refreshToken.user)
  refreshTokens: RefreshToken[];
}
