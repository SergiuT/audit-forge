// modules/compliance/compliance.module.ts
import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { ComplianceModule } from '../compliance/compliance.module';
import { S3Service } from '@/shared/services/s3.service';
import { AWSSecretManagerService } from '@/shared/services/aws-secret.service';
import { Integration } from './entities/integration.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntegrationProject } from './entities/integration-project.entity';
import { GitHubAuthService } from '@/shared/services/github-auth.service';
import { GitHubService } from '@/shared/services/github.service';
import { GCPService } from '@/shared/services/gcp.service';
import { ComplianceReport } from '../compliance/entities/compliance-report.entity';
import { AWSScanService } from './services/aws-scan.service';
import { GCPScanService } from './services/gcp-scan.service';
import { GithubScanService } from './services/github-scan.service';
import { AuditTrailService } from '../audit-trail/audit.service';
import { AuditEvent } from '../audit-trail/entities/audit-event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Integration,
      IntegrationProject,
      ComplianceReport,
      AuditEvent
    ]),
    ComplianceModule
  ],
  controllers: [IntegrationsController],
  providers: [
    IntegrationsService,
    S3Service,
    AWSSecretManagerService,
    GitHubAuthService,
    GitHubService,
    GCPService,
    AWSScanService,
    GCPScanService,
    GithubScanService,
    AuditTrailService
  ],
  exports: [
    IntegrationsService,
    GithubScanService, // Export for use in other modules
    AWSScanService,
    GCPScanService,
  ]
})
export class IntegrationsModule { }
