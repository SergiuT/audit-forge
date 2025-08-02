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
import { OAuth2Client } from 'google-auth-library';
import { RetryService } from '@/shared/services/retry.service';
import { CircuitBreakerService } from '@/shared/services/circuit-breaker.service';
import { createOAuthState } from "@/shared/utils/oauth-state.util";
import { User } from "@/modules/auth/entities/user.entity";

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
    private readonly auditTrailService: AuditTrailService,
    private readonly retryService: RetryService,
    private readonly circuitBreakerService: CircuitBreakerService,
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

    this.logger.log(`Starting OAuth exchange for user ${userId}, project ${projectId}`);
    this.logger.log(`Client ID: ${clientId.substring(0, 10)}...`);
    this.logger.log(`Redirect URI: ${redirectUri}`);

    const oauth2Client = new OAuth2Client(
      clientId,
      clientSecret,
      redirectUri
    );

    try {
      this.logger.log('Exchanging authorization code for tokens...');
      const { tokens } = await oauth2Client.getToken(authorizationCode);

      if (!tokens.access_token) {
        throw new BadRequestException('Failed to obtain access token');
      }

      this.logger.log('Successfully obtained access token');

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
        this.logger.log('Updating existing GCP OAuth integration...');
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

      this.logger.log('Creating integration record...');
      const integration = await this.integrationRepository.save({
        type: IntegrationType.GCP,
        name: 'GCP OAuth Integration',
        credentials: secretRef,
        useManager: useAWSSecretsManager,
        projectId,
        userId,
      });

      this.logger.log('Fetching user GCP projects...');

      // Fetch user's GCP projects for selection
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
        this.logger.error('Project error details:', {
          message: projectError.message,
          stack: projectError.stack,
          credentialsType: credentials.type,
          hasAccessToken: !!credentials.access_token,
          hasRefreshToken: !!credentials.refresh_token
        });

        // Don't fail the entire integration creation if project fetching fails
        // The integration is still created and can be used later
        this.logger.warn('Integration created successfully, but project fetching failed. User can retry later.');
      }

      this.logger.log('OAuth integration completed successfully');
      return integration;
    } catch (error) {
      this.logger.error('Failed to exchange authorization code for tokens', error);
      this.logger.error('Error details:', {
        message: error.message,
        code: error.code,
        status: error.status,
        response: error.response?.data
      });

      // Provide more specific error message
      let errorMessage = 'Failed to authenticate with GCP';
      if (error.message.includes('headers.forEach')) {
        errorMessage = 'Google Auth Library configuration issue. Please check your OAuth setup.';
      } else if (error.message.includes('invalid_grant')) {
        errorMessage = 'Authorization code expired or invalid. Please try the OAuth flow again.';
      } else if (error.message.includes('redirect_uri_mismatch')) {
        errorMessage = 'Redirect URI mismatch. Please check your OAuth configuration.';
      }

      throw new BadRequestException(`${errorMessage}: ${error.message}`);
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

    for (const project of integrationProjects) {
      const { integration } = project;
      if (!integration || integration.projectId != projectId) continue;

      try {
        const token = integration.useManager
          ? await this.awsSecretManagerService.getSecretValue(integration.credentials)
          : decrypt(integration.credentials, this.encryptionKey);

        // Call your existing log ingestion method
        await this.processGcpLogs({
          credentialsJson: token,
          gcpProjectId: project.externalId,
          filter: 'resource.type="gce_instance"', // or allow filter override later
          projectId: +projectId,
          user,
          tokenType: integration.useManager ? 'secretsManager' : 'aes',
          integrationId: integration.id,
        });

        await this.auditTrailService.logEvent({
          userId: user.id,
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

  private async updateGCPProjects(integrationId: string, credentialsJson: string): Promise<void> {
    try {
      const projects = await this.gcpService.getProjects(credentialsJson);
  
      if (projects.length > 0) {
        this.logger.log('Saving integration projects...');
        for (const project of projects) {
          this.logger.log(`Processing project: ${project.projectId} - ${project.name}`);
  
          // Check if project already exists
          const existingProject = await this.integrationProjectRepository.findOne({
            where: {
              integrationId,
              externalId: project.projectId,
            },
          });
  
          if (existingProject) {
            // Update existing project
            existingProject.name = project.name;
            existingProject.metadata = {
              number: project.number,
              labels: project.labels,
              state: project.state,
            };
            await this.integrationProjectRepository.save(existingProject);
          } else {
            // Create new project
            await this.integrationProjectRepository.save({
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
        this.logger.log(`Successfully updated ${projects.length} integration projects`);
      } else {
        this.logger.warn('No GCP projects found for user');
      }
    } catch (projectError) {
      this.logger.error('Failed to fetch GCP projects:', projectError);
      // Don't fail the entire integration creation
      this.logger.warn('Integration created/updated successfully, but project fetching failed.');
    }
  }

  async processGcpLogs({
    gcpProjectId,
    credentialsJson,
    projectId,
    filter,
    user,
    tokenType,
    integrationId,
    scannedAt = new Date(),
  }: {
    gcpProjectId: string;
    credentialsJson: string;
    filter: string;
    projectId: number;
    user: User;
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
        userId: user.id,
        status: 'pending',
        fileDataKey: '', // filled after upload
      },
      fakeFile,
      user,
      'gcp',
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

    return this.retryService.withRetry({
      execute: () => this.circuitBreakerService.execute(
        'gcp-fetch-logs',
        async () => {
          try {
            const [entries]: any = await logging.getEntries({
              // filter,
              pageSize: limit,
              orderBy: 'timestamp desc',
            });
            const decodedLogs = await decodeGcpAuditLogs(entries);

            this.logger.log('Decoded logs', decodedLogs, null, 4);

            return decodedLogs.join('\n\n');
          } catch (err) {
            this.logger.error('Failed to fetch logs from GCP', err);
            throw err;
          }
        }
      ),
      maxRetries: 3,
      retryDelay: (retryCount) => Math.min(1000 * Math.pow(2, retryCount), 10000),
    });
  }
}