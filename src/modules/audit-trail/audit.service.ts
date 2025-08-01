// src/audit/audit-trail.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AuditAction, AuditEvent } from './entities/audit-event.entity';
import { Repository } from 'typeorm';
import { format } from 'date-fns';
import { GetEventsQueryDto } from './dto/get-events-query.dto';

@Injectable()
export class AuditTrailService {
  constructor(
    @InjectRepository(AuditEvent)
    private readonly auditRepository: Repository<AuditEvent>,
  ) {}

  async getEvents(filters: GetEventsQueryDto, userId: string) {
    const qb = this.auditRepository.createQueryBuilder('event')
      .where('event.userId = :userId', { userId })
      .leftJoinAndSelect('event.user', 'user') // if you have a relation
      .addSelect(['user.id', 'user.email', 'user.role']) 
      .orderBy('event.createdAt', 'DESC');

    if (filters.projectId) {
      qb.andWhere('event.projectId = :projectId', { projectId: filters.projectId });
    }

    if (filters.resourceType) {
      qb.andWhere('event.resourceType = :resourceType', { resourceType: filters.resourceType });
    }

    if (filters.action) {
      qb.andWhere('event.action = :action', { action: filters.action });
    }

    if (filters.resourceId) {
      qb.andWhere('event.resourceId = :resourceId', { resourceId: filters.resourceId });
    }

    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100); // max 100 per page
  
    qb.skip((page - 1) * limit).take(limit);
  
    const [events, total] = await qb.getManyAndCount();

    return {
      data: events.map(event => ({
        id: event.id,
        action: event.action,
        projectId: event.projectId,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        metadata: event.metadata,
        createdAt: event.createdAt,
        user: event.user ? {
          id: event.user.id,
          email: event.user.email,
          role: event.user.role,
        } : null,
      })),
      total,
      page,
      pageCount: Math.ceil(total / limit),
    };
  }

  async getGroupedEvents(filters: GetEventsQueryDto, userId: string) {
    const qb = this.auditRepository.createQueryBuilder('event')
      .where('event.userId = :userId', { userId })
      .leftJoin('event.user', 'user')
      .addSelect(['user.id', 'user.email', 'user.role'])
      .orderBy('event.createdAt', 'DESC');
  
    if (filters.projectId) {
      qb.andWhere('event.projectId = :projectId', { projectId: filters.projectId });
    }
    if (filters.resourceType) {
      qb.andWhere('event.resourceType = :resourceType', { resourceType: filters.resourceType });
    }
    if (filters.resourceId) {
      qb.andWhere('event.resourceId = :resourceId', { resourceId: filters.resourceId });
    }
  
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
  
    qb.skip((page - 1) * limit).take(limit);
  
    const [events, total] = await qb.getManyAndCount();
  
    // GROUP BY DATE
    const grouped = events.reduce((acc, event) => {
      const date = format(new Date(event.createdAt), 'yyyy-MM-dd'); // e.g. "2025-04-26"
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push({
        id: event.id,
        action: event.action,
        projectId: event.projectId,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        metadata: event.metadata,
        createdAt: event.createdAt,
        user: event.user ? {
          id: event.user.id,
          email: event.user.email,
          role: event.user.role,
        } : null,
      });
      return acc;
    }, {} as Record<string, any[]>);
  
    // Transform into an array sorted by date descending
    const timeline = Object.entries(grouped)
      .map(([date, events]) => ({ date, events }))
      .sort((a, b) => b.date.localeCompare(a.date)); // Newest first
  
    return {
      data: timeline,
      total,
      page,
      pageCount: Math.ceil(total / limit),
    };
  }

  async logEvent({
    userId,
    action,
    resourceType,
    resourceId,
    projectId,
    metadata = {},
  }: {
    userId: number;
    action: AuditAction;
    resourceType?: string;
    projectId?: number;
    resourceId?: string;
    metadata?: Record<string, any>;
  }) {
    const audit = this.auditRepository.create({
      userId,
      action,
      resourceType,
      resourceId,
      projectId,
      metadata,
    });

    return this.auditRepository.save(audit);
  }
}
