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
import { OAuth2Client } from 'google-auth-library';
import { RetryService } from '@/shared/services/retry.service';
import { CircuitBreakerService } from '@/shared/services/circuit-breaker.service';
import { createOAuthState } from "@/shared/utils/oauth-state.util";
import { User } from "@/modules/auth/entities/user.entity";
import { BatchProcessorService } from "@/shared/services/batch-processor.service";

@Injectable()
export class GCPScanService {
  private readonly logger = new Logger(IntegrationsService.name);
  private encryptionKey: string; 

  constructor(
    @InjectRepository(Integration)
    private integrationRepository: Repository<Integration>,
    @InjectRepository(IntegrationProject)
    private integrationProjectRepository: Repository<IntegrationProject>,

    private readonly gcpService: GCPService,
    private readonly awsSecretManagerService: AWSSecretManagerService,
    private readonly complianceService: ComplianceService,
    private configService: ConfigService,
    private readonly retryService: RetryService,
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly batchProcessorService: BatchProcessorService,
  ) { }

  async onModuleInit(): Promise<void> {
    const key = await this.awsSecretManagerService.getSecretWithFallback('encryption-key', 'ENCRYPTION_KEY');
    this.encryptionKey = key;
  }

  async generateAuthUrl(projectId: string, userId: string): Promise<{ authUrl: string }> {
    const clientId = this.configService.get<string>('GCP_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GCP_CLIENT_SECRET');
    const redirectUri = this.configService.get<string>('GCP_REDIRECT_URI');

    if (!clientId || !clientSecret || !redirectUri) {
      throw new BadRequestException('GCP OAuth credentials not configured');
    }

    const oauth2Client = new OAuth2Client(
      clientId,
      clientSecret,
      redirectUri
    );

    const state = createOAuthState(userId, projectId, true);

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/cloud-platform',
        'https://www.googleapis.com/auth/logging.read',
        'https://www.googleapis.com/auth/cloudplatformprojects.readonly'
      ],
      state,
      prompt: 'consent' // Force consent to get refresh token
    });

    return { authUrl };
  }

  async createOrUpdateGCPIntegrationOAuth({
    projectId,
    userId,
    authorizationCode,
    redirectUri,
  }: {
    projectId: string;
    userId: number;
    authorizationCode: string;
    redirectUri: string;
  }): Promise<Integration> {
    const clientId = this.configService.get<string>('GCP_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GCP_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new BadRequestException('GCP OAuth credentials not configured');
    }

    let existing = await this.integrationRepository.findOne({
      where: {
        userId,
        projectId,
        type: IntegrationType.GCP,
      },
    });

    const oauth2Client = new OAuth2Client(
      clientId,
      clientSecret,
      redirectUri
    );

    try {
      const { tokens } = await oauth2Client.getToken(authorizationCode);

      if (!tokens.access_token) {
        throw new BadRequestException('Failed to obtain access token');
      }

      // Create credentials object similar to service account
      const credentials = {
        type: 'authorized_user',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        token_type: tokens.token_type,
        expiry_date: tokens.expiry_date,
      };

      const credentialsJson = JSON.stringify(credentials);
      let secretRef = '';
      const useAWSSecretsManager = await this.awsSecretManagerService.useAWSSecretsManager();

      if (existing) {
        if (existing.useManager) {
          await this.awsSecretManagerService.updateSecret(existing.credentials, credentialsJson);
          secretRef = existing.credentials;
        } else {
          secretRef = encrypt(credentialsJson, this.encryptionKey);
        }
    
        existing.name = 'GCP OAuth Integration';
        existing.updatedAt = new Date();
        existing.credentials = secretRef;
        existing.useManager = useAWSSecretsManager;
    
        const updated = await this.integrationRepository.save(existing);
        
        // Update projects for existing integration
        await this.updateGCPProjects(updated.id, credentialsJson);
        
        return updated;
      }
      
      if (useAWSSecretsManager) {
        secretRef = await this.awsSecretManagerService.createSecret(
          `gcp-oauth-${userId}-${Date.now()}`,
          credentialsJson
        );
      } else {
        secretRef = encrypt(credentialsJson, this.encryptionKey);
      }

      const integration = await this.integrationRepository.save({
        type: IntegrationType.GCP,
        name: 'GCP OAuth Integration',
        credentials: secretRef,
        useManager: useAWSSecretsManager,
        projectId,
        userId,
      });

      this.logger.log('Fetching user GCP projects...');
      try {
        const projects = await this.gcpService.getProjects(credentialsJson);

        if (projects.length > 0) {
          this.logger.log('Saving integration projects...');
          for (const project of projects) {
            this.logger.log(`Processing project: ${project.projectId} - ${project.name}`);

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
          this.logger.log(`Successfully saved ${projects.length} integration projects`);
        } else {
          this.logger.warn('No GCP projects found for user');
        }
      } catch (projectError) {
        this.logger.error('Failed to fetch GCP projects:', projectError);
      }

      this.logger.log('OAuth integration completed successfully');
      return integration;
    } catch (error) {
      this.logger.error('Failed to exchange authorization code for tokens', error);
      throw new BadRequestException(`Error: ${error.message}`);
    }
  }

  async scanGCPIntegrationProjects(projectId: string, selectedProjects: string[], user: User) {
    const integrationProjects = await this.integrationProjectRepository.find({
      where: {
        type: IntegrationType.GCP,
        externalId: In(selectedProjects),
      },
      relations: ['integration'],
    });

    const projectsByIntegration = this.batchProcessorService.groupBy(
      integrationProjects, 
      project => project.integration.id
    );

    const integrationResults = await this.batchProcessorService.processBatch({
      items: Array.from(projectsByIntegration.entries()),
      processor: async ([integrationId, projects]) => {
        return this.processGCPIntegrationBatch(integrationId, projects, user);
      },
      config: {
        maxConcurrency: 3,
        batchSize: 1,
        rateLimitDelay: 2000,
      },
      onProgress: (processed, total) => {
        this.logger.log(`Processed ${processed}/${total} GCP integrations`);
      }
    });
  
    const scanResults = {
      processed: integrationResults.success.reduce((sum, result) => sum + result.processed, 0),
      failed: integrationResults.success.reduce((sum, result) => sum + result.failed, 0),
    }

    this.logger.log(
      `GCP batch scan completed. Processed: ${scanResults.processed}, Failed: ${scanResults.failed}`
    );

    return scanResults;
  }

  private async processGCPIntegrationBatch(
    integrationId: string, 
    projects: IntegrationProject[], 
    user: User,
  ) {
    const integration = projects[0].integration;
    const token = integration.useManager
      ? await this.awsSecretManagerService.getSecretValue(integration.credentials)
      : decrypt(integration.credentials, this.encryptionKey);
  
    const result = await this.batchProcessorService.processBatch({
      items: projects,
      processor: async (project) => this.processSingleGCPProject(project, token, user),
      config: {
        maxConcurrency: 5,
        batchSize: 10,
        rateLimitDelay: 1000,
      },
      onProgress: (processed, total) => {
        this.logger.log(`Processed ${processed}/${total} GCP projects for integration ${integrationId}`);
      }
    });
  
    return {
      processed: result.success.length,
      failed: result.failed.length,
    };
  }
  
  private async processSingleGCPProject(
    project: IntegrationProject, 
    token: string, 
    user: User
  ): Promise<'processed' | 'failed'> {
    try {
      await this.processGcpLogs({
        credentialsJson: token,
        gcpProjectId: project.externalId,
        projectId: +project.integration.projectId,
        user,
        tokenType: project.integration.useManager ? 'secretsManager' : 'aes',
        integrationId: project.integration.id,
      });
  
      // Update project metadata
      project.lastScannedAt = new Date();
      await this.integrationProjectRepository.save(project);
  
      return 'processed';
    } catch (error) {
      this.logger.error(`[GCP] Failed to process project ${project.externalId}:`, error);
      return 'failed';
    }
  }

  private async updateGCPProjects(integrationId: string, credentialsJson: string): Promise<void> {
    try {
      const projects = await this.gcpService.getProjects(credentialsJson);
  
      if (projects.length === 0) {
        this.logger.warn('No GCP projects found for user');
        return;
      }
  
      const projectResults = await this.batchProcessorService.processBatch({
        items: projects,
        processor: async (project) => this.processGCPProjectSave(project, integrationId),
        config: {
          maxConcurrency: 20,
          batchSize: 50,
          rateLimitDelay: 0,
        },
        onProgress: (processed, total) => {
          this.logger.log(`Saved ${processed}/${total} GCP projects`);
        }
      });

      this.logger.log(
        `GCP project discovery completed. Success: ${projectResults.success.length}, ` +
        `Failed: ${projectResults.failed.length}`
      );
    } catch (projectError) {
      this.logger.error('Failed to fetch GCP projects:', projectError);
      this.logger.warn('Integration created/updated successfully, but project fetching failed.');
    }
  }

  private async processGCPProjectSave(project: any, integrationId: string) {
    const existingProject = await this.integrationProjectRepository.findOne({
      where: {
        integrationId,
        externalId: project.projectId,
      },
    });
  
    if (existingProject) {
      existingProject.name = project.name;
      existingProject.metadata = {
        number: project.number,
        labels: project.labels,
        state: project.state,
      };
      return this.integrationProjectRepository.save(existingProject);
    } else {
      return this.integrationProjectRepository.save({
        type: IntegrationType.GCP,
        name: project.name,
        externalId: project.projectId,
        metadata: {
          number: project.number,
          labels: project.labels,
          state: project.state,
        },
        integrationId,
      });
    }
  }

  async processGcpLogs({
    gcpProjectId,
    credentialsJson,
    projectId,
    user,
    tokenType,
    integrationId,
    scannedAt = new Date(),
  }: {
    gcpProjectId: string;
    credentialsJson: string;
    projectId: number;
    user: User;
    integrationId: string;
    tokenType: 'aes' | 'secretsManager';
    scannedAt?: Date;
  }) {
    const logContent = await this.fetchLogsFromGCP(gcpProjectId, 50, credentialsJson);

    return this.complianceService.create(
      {
        reportData: {
          description: 'Logs from GCP',
          details: {
            source: 'GCP Logs',
            ingestedAt: new Date(),
            scannedAt,
            tokenType,
            integrationId
          },
        },
        projectId,
        userId: user.id,
        status: 'pending',
      },
      logContent,
      user,
      'gcp',
    );
  }

  async fetchLogsFromGCP(
    gcpProjectId: string,
    limit = 50,
    credentialsJson: string
  ): Promise<string> {
    const creds = JSON.parse(credentialsJson);
    const logging = new Logging({
      projectId: gcpProjectId,
      credentials: creds,
    });

    return this.retryService.withRetry({
      execute: () => this.circuitBreakerService.execute(
        'gcp-fetch-logs',
        async () => {
          try {
            const [entries]: any = await logging.getEntries({
              filter: `
                logName="projects/${gcpProjectId}/logs/cloudaudit.googleapis.com%2Factivity"
                timestamp >= "${new Date(Date.now() - 1000 * 60 * 60).toISOString()}"
              `,
              pageSize: limit,
              orderBy: 'timestamp desc',
            });
            const decodedLogs = await decodeGcpAuditLogs(entries);

            return decodedLogs.join('\n\n');
          } catch (err) {
            this.logger.error('Failed to fetch logs from GCP', err);
            throw err;
          }
        }
      ),
      serviceName: 'gcp-fetch-logs',
      maxRetries: 3,
      retryDelay: (retryCount) => Math.min(1000 * Math.pow(2, retryCount), 10000),
    });
  }
}