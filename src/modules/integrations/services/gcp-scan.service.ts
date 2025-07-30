import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { Integration, IntegrationType } from "../entities/integration.entity";
import { Logging } from "@google-cloud/logging";
import { decodeGcpAuditLogs } from "@/shared/utils/decode-gcp-logs.util";
import { GCPService } from "@/shared/services/gcp.service";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { decrypt, encrypt } from "@/shared/utils/encryption.util";
import { IntegrationProject } from "../entities/integration-project.entity";
import { ComplianceService } from "@/modules/compliance/compliance.service";
import { ConfigService } from "@nestjs/config";
import { AWSSecretManagerService } from "@/shared/services/aws-secret.service";
import { IntegrationsService } from "../integrations.service";
import { AuditTrailService } from "@/modules/audit-trail/audit.service";
import { AuditAction } from "@/modules/audit-trail/entities/audit-event.entity";

@Injectable()
export class GCPScanService {
    private readonly logger = new Logger(IntegrationsService.name);
    
    constructor(
        @InjectRepository(Integration)
        private integrationRepository: Repository<Integration>,
        @InjectRepository(IntegrationProject)
        private integrationProjectRepository: Repository<IntegrationProject>,

        private readonly gcpService: GCPService,
        private readonly awsSecretManagerService: AWSSecretManagerService,
        private readonly complianceService: ComplianceService,
        private configService: ConfigService,
        private readonly auditTrailService: AuditTrailService,
    ) {}

    async createOrUpdateGCPIntegration({
      file,
      projectId,
      userId,
    }: {
      file: Express.Multer.File;
      projectId: string;
      userId: string;
    }): Promise<Integration> {
      if (!file) throw new BadRequestException('GCP credentials file is required');
    
      const rawCredentials = file.buffer.toString('utf-8');
      let secretRef = '';
      const useManager = this.useAWSSecretsManager();
    
      if (useManager) {
        secretRef = await this.awsSecretManagerService.createSecret(
          `gcp-${userId}-${Date.now()}`,
          rawCredentials
        );
      } else {
        secretRef = encrypt(rawCredentials);
      }
    
      const integration = await this.integrationRepository.save({
        type: IntegrationType.GCP,
        name: 'GCP Integration',
        credentials: secretRef,
        useManager,
        projectId,
        userId,
      });
    
      const projects = await this.gcpService.getProjects(rawCredentials);
    
      for (const project of projects) {
        await this.integrationProjectRepository.save({
          type: IntegrationType.GCP,
          name: project.name,
          externalId: project.projectId,
          metadata: {
            number: project.number,
            labels: project.labels,
            state: project.state,
          },
          integrationId: integration.id,
        });
      }
    
      return integration;
    }
  
    async scanGCPIntegrationProjects(projectId: string, selectedProjects: string[]) {
      const integrationProjects = await this.integrationProjectRepository.find({
        where: {
          type: IntegrationType.GCP,
          externalId: In(selectedProjects),
        },
        relations: ['integration'],
      });
    
      for (const project of integrationProjects) {
        const { integration } = project;
        if (!integration || integration.projectId != projectId) continue;
    
        try {
          const token = integration.useManager
            ? await this.awsSecretManagerService.getSecretValue(integration.credentials)
            : decrypt(integration.credentials);
    
          // Call your existing log ingestion method
          await this.processGcpLogs({
            credentialsJson: token,
            gcpProjectId: project.externalId,
            filter: 'resource.type="gce_instance"', // or allow filter override later
            projectId: +projectId,
            userId: Number(integration.userId),
            tokenType: integration.useManager ? 'secretsManager' : 'aes',
            integrationId: integration.id,
          });

          await this.auditTrailService.logEvent({
            userId: Number(integration.userId),
            projectId: +projectId,
            action: AuditAction.SCAN_COMPLETED,
            resourceType: 'IntegrationProject',
            resourceId: integration.id,
            metadata: {
              type: IntegrationType.GCP,
              gcpProjectId: project.externalId,
            },
          });
    
          // Update scan metadata
          project.lastScannedAt = new Date();
          await this.integrationProjectRepository.save(project);
        } catch (err) {
          this.logger.warn(`[GCP] Failed to process project ${project.externalId}`, err);
        }
      }
    }  
    
    async processGcpLogs({
      gcpProjectId,
      credentialsJson,
      projectId,
      filter,
      userId = 1,
      tokenType,
      integrationId,
      scannedAt = new Date(),
    }: {
      gcpProjectId: string;
      credentialsJson: string;
      filter: string;
      projectId: number;
      userId?: number;
      integrationId: string;
      tokenType: 'aes' | 'secretsManager';
      scannedAt?: Date;
    }) {
      const logContent = await this.fetchLogsFromGCP(gcpProjectId, filter, 50, credentialsJson);
  
      const filename = `gcp-${Date.now()}.txt`;
      const fakeFile: Express.Multer.File = {
        originalname: filename,
        mimetype: 'text/plain',
        buffer: Buffer.from(logContent),
        fieldname: 'file',
        size: logContent.length,
        encoding: '7bit',
        stream: null as any,
        destination: '',
        filename: '',
        path: '',
      };
      
      return this.complianceService.create(
        {
          reportData: {
            description: 'Logs from GCP',
            details: {
              source: 'GCP Logs',
              ingestedAt: new Date().toISOString(),
              scannedAt,
              tokenType,
              integrationId
            },
          },
          projectId,
          userId,
          status: 'pending',
          fileDataKey: '', // filled after upload
        },
        userId,
        fakeFile,
        'gcp-logs',
      );
    }
  
    async fetchLogsFromGCP(
      gcpProjectId: string,
      filter: string,
      limit = 50,
      credentialsJson: string
    ): Promise<string> {
      const creds = JSON.parse(credentialsJson);
      const logging = new Logging({
        projectId: gcpProjectId,
        credentials: creds,
      });
  
      try {
        const [entries]: any = await logging.getEntries({
          filter,
          pageSize: limit,
          orderBy: 'timestamp desc',
        });
        this.logger.log(entries, null, 4);
        const decodedLogs = await decodeGcpAuditLogs(entries);
  
        return decodedLogs.join('\n\n');
      } catch (err) {
        this.logger.error('Failed to fetch logs from GCP', err);
        throw err;
      }
    }

    private useAWSSecretsManager(): boolean {
        const region = this.configService.get<string>('AWS_REGION');
        const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY');
        const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
        const enableSecretManager = this.configService.get<string>('ENABLE_SECRETS_MANAGER')
    
        return Boolean(
          region &&
          accessKeyId &&
          secretAccessKey &&
          enableSecretManager === 'true'
        );
    }
}