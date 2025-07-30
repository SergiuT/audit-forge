import { User } from '@/modules/auth/entities/user.entity';
import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';

export enum AuditAction {
    CHECKLIST_UPDATED = 'CHECKLIST_UPDATED',
    REPORT_CREATED = 'REPORT_CREATED',
    CONTROL_ASSIGNED = 'CONTROL_ASSIGNED',
    CHECKLIST_STATUS_CHANGED = 'CHECKLIST_STATUS_CHANGED',
    SCAN_STARTED = 'SCAN_STARTED',
    SCAN_COMPLETED = 'SCAN_COMPLETED',
}

@Entity()
export class AuditEvent {
    @PrimaryGeneratedColumn()
    id: number;
  
    @Column()
    userId: number;
  
    @Column()
    action: AuditAction;
    
    @Column({ nullable: true })
    projectId?: number;
  
    @Column({ nullable: true })
    resourceType?: string; // e.g. "report", "checklist", "integration"
  
    @Column({ nullable: true })
    resourceId?: string;
  
    @Column({ type: 'jsonb', nullable: true })
    metadata?: Record<string, any>;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    createdAt: Date;

    @ManyToOne(() => User, { eager: false, nullable: true })
    @JoinColumn({ name: 'userId' })
    user: User;
  
    @CreateDateColumn()
    timestamp: Date;
}  