// audit.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEvent } from './entities/audit-event.entity';
import { AuditTrailService } from './audit.service';
import { AuditTrailController } from './audit.controller';
import { User } from '../auth/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AuditEvent]), User],
  controllers: [AuditTrailController],
  providers: [AuditTrailService],
  exports: [AuditTrailService],
})
export class AuditTrailModule {}
