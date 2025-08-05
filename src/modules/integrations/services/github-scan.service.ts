import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { Integration, IntegrationType } from "../entities/integration.entity";
import { GitHubService } from "@/shared/services/github.service";
import { InjectRepository } from "@nestjs/typeorm";
import { IntegrationProject } from "../entities/integration-project.entity";
import { Repository, In } from "typeorm";
import { AWSSecretManagerService } from "@/shared/services/aws-secret.service";
import { decrypt, encrypt } from "@/shared/utils/encryption.util";
import { ConfigService } from "@nestjs/config";
import axios from 'axios';
import * as unzipper from 'unzipper';
import * as stream from 'stream';
import { promisify } from 'util';
import { CreateComplianceReportDto } from '@/modules/compliance/dto/create-compliance-report.dto';
import { IntegrationsService } from "../integrations.service";
import { ComplianceService } from "@/modules/compliance/compliance.service";
import { RetryService } from "@/shared/services/retry.service";
import { createOAuthState } from "@/shared/utils/oauth-state.util";
import { User } from "@/modules/auth/entities/user.entity";
import { BatchProcessorService } from "@/shared/services/batch-processor.service";

const pipeline = promisify(stream.pipeline);

@Injectable()
export class GithubScanService {
  private readonly logger = new Logger(IntegrationsService.name);
  private encryptionKey: string;

  constructor(
    @InjectRepository(IntegrationProject)
    private integrationProjectRepository: Repository<IntegrationProject>,
    @InjectRepository(Integration)
    private integrationRepository: Repository<Integration>,

    private githubService: GitHubService,
    private configService: ConfigService,
    private readonly batchProcessorService: BatchProcessorService,
    private readonly complianceService: ComplianceService,
    private readonly awsSecretManagerService: AWSSecretManagerService,
    private readonly retryService: RetryService,
  ) { }

  async onModuleInit(): Promise<void> {
    const key = await this.awsSecretManagerService.getSecretWithFallback('encryption-key', 'ENCRYPTION_KEY');
    this.encryptionKey = key;
  }

  async generateAuthUrl(projectId: string, userId: string): Promise<{ authUrl: string }> {
    const clientId = this.configService.get<string>('GITHUB_CLIENT_ID');
    const redirectUri = this.configService.get<string>('GITHUB_REDIRECT_URI');

    if (!clientId || !redirectUri) {
      throw new BadRequestException('GitHub OAuth credentials not configured');
    }

    const state = createOAuthState(userId, projectId, true);

    // Manual URL construction with proper encoding
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      state: state,
      scope: 'repo,workflow'
    });

    const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
    return { authUrl };
  }

  async createOrUpdateGitHubIntegration(token: string, userId: number, projectId: string): Promise<Integration> {
    const githubUser = await this.githubService.getUserInfo(token);
    const integrationName = `GitHub (${githubUser.login})`;

    // Check if this GitHub integration already exists for the user + project
    let existing = await this.integrationRepository.findOne({
      where: {
        userId,
        projectId,
        type: IntegrationType.GITHUB,
      },
    });

    let secretRef = '';

    if (existing) {
      // Update existing secret
      if (existing.useManager) {
        await this.awsSecretManagerService.updateSecret(existing.credentials, token);
        secretRef = existing.credentials;
      } else {
        secretRef = encrypt(token, this.encryptionKey);
      }

      existing.name = integrationName;
      existing.updatedAt = new Date();
      existing.credentials = secretRef;

      await this.discoverGitHubRepos(existing.id);
      return existing;
    }

    // New integration
    const useAWSSecretsManager = await this.awsSecretManagerService.useAWSSecretsManager();
    if (useAWSSecretsManager) {
      secretRef = await this.awsSecretManagerService.createSecret(`github-${userId}-${Date.now()}`, token);
    } else {
      secretRef = encrypt(token, this.encryptionKey);
    }

    const integration = this.integrationRepository.create({
      type: IntegrationType.GITHUB,
      name: integrationName,
      credentials: secretRef,
      useManager: useAWSSecretsManager,
      userId,
      projectId,
    });

    const saved = await this.integrationRepository.save(integration)
    await this.discoverGitHubRepos(saved.id);

    return saved;
  }

  async scanGitHubIntegrationProjects(projectId: string, selectedRepos: string[], user: User) {
    this.logger.log(`Scanning GitHub projects. ProjectId: ${projectId}, SelectedRepos: ${JSON.stringify(selectedRepos)}`);

    // Build the where condition properly
    let whereCondition: any = {
      type: IntegrationType.GITHUB,
      integration: { projectId }
    };

    // Only add externalId filter if selectedRepos is not empty
    if (selectedRepos && selectedRepos.length > 0) {
      whereCondition.externalId = In(selectedRepos);
      this.logger.log(`Filtering by specific repos: ${selectedRepos.join(', ')}`);
    } else {
      this.logger.log('No specific repos provided - this will scan ALL GitHub repos');
    }

    const integrationProjects = await this.integrationProjectRepository.find({
      where: whereCondition,
      relations: ['integration', 'integration.project'],
    });

    if (!integrationProjects.length) {
      this.logger.warn('No integration projects found');
      return;
    }
    this.logger.log(`Found ${integrationProjects.length} integration projects`);

    const projectsByIntegration = this.batchProcessorService.groupBy(
      integrationProjects, 
      project => project.integration.id
    );

    const integrationResults = await this.batchProcessorService.processBatch({
      items: Array.from(projectsByIntegration.entries()),
      processor: async ([integrationId, projects]) => {
        return this.processIntegrationBatch(integrationId, projects, user);
      },
      config: {
        maxConcurrency: 3,
        batchSize: 1,
        rateLimitDelay: 2000,
      },
      onProgress: (processed, total) => {
        this.logger.log(`Processed ${processed}/${total} integrations`);
      }
    });
    
    this.logger.log(
      `Batch scan completed. Processed: ${integrationResults.success.length}, ` +
      `Skipped: ${integrationResults.skipped.length}, Failed: ${integrationResults.failed.length}`
    );
  }

  private async processIntegrationBatch(
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
      processor: async (project) => this.processSingleRepo(project, token, user),
      config: {
        maxConcurrency: 10,
        batchSize: 20,
        rateLimitDelay: 1000,
      },
      onProgress: (processed, total) => {
        this.logger.log(`Processed ${processed}/${total} repos for integration ${integrationId}`);
      }
    });
  
    return {
      processed: result.success.length,
      skipped: result.skipped.length,
      failed: result.failed.length,
    };
  }
  
  private async processSingleRepo(
    project: IntegrationProject, 
    token: string, 
    user: User
  ): Promise<'processed' | 'skipped'> {
    const [owner, repo] = project.externalId.split('/');
    
    try {
      const workflowRuns = await this.githubService.getWorkflowRuns(token, owner, repo);
      const trivyRuns = this.filterTrivyRuns(workflowRuns);
      
      if (!trivyRuns.length) {
        this.logger.log(`[BATCH] No trivy runs for ${project.externalId}`);
        return 'skipped';
      }
  
      const lastRun = trivyRuns.sort((a, b) => b.id - a.id)[0];
      const existingReport = await this.complianceService.findOneByRunId(lastRun.id);
  
      if (existingReport) {
        this.logger.warn(`[BATCH] Skipping existing run ${lastRun.id} for ${project.externalId}`);
        return 'skipped';
      }
  
      await this.processGitHubLogs({
        token,
        owner,
        repo,
        runId: lastRun.id,
        projectId: +project.integration.projectId,
        useManager: project.integration?.useManager,
        integrationId: project.integration?.id,
        user,
      });
  
      // Update project metadata
      project.lastRunId = lastRun.id;
      project.lastScannedAt = new Date();
      await this.integrationProjectRepository.save(project);
  
      return 'processed';
    } catch (error) {
      this.logger.error(`[BATCH] Failed to process ${project.externalId}:`, error);
      throw error;
    }
  }
  
  private filterTrivyRuns(workflowRuns: any[]) {
    return workflowRuns.filter(run =>
      run.name?.toLowerCase().includes('trivy') ||
      run.path?.toLowerCase().includes('trivy') ||
      run.head_branch === 'trivy'
    );
  }

  async processGitHubLogs({
    token,
    owner,
    repo,
    runId,
    projectId,
    useManager,
    integrationId,
    user,
  }: {
    token: string;
    owner: string;
    repo: string;
    runId: number;
    projectId: number;
    useManager: boolean;
    integrationId: string;
    user: User;
  }) {
    try {
      let response;

      try {
        response = await this.retryService.withRetry({
          execute: async () => {
            const url = `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/logs`;
            return axios({
              url,
              method: 'GET',
              responseType: 'stream',
              headers: {
                Authorization: `token ${token}`,
                'User-Agent': 'AuditForge',
                Accept: 'application/vnd.github.v3+json',
              },
            });
          },
          serviceName: 'github-get-run-logs',
          maxRetries: 3,
          retryDelay: (retry) => Math.min(1000 * 2 ** retry, 5000),
        });
      } catch (err) {
        this.logger.error(`[GitHub] Failed to fetch logs for ${owner}/${repo} runId ${runId}`, err);
        throw new BadRequestException('GitHub Actions logs could not be retrieved');
      }

      const buffers: string[] = [];

      await pipeline(
        response.data,
        unzipper.Parse(),
        new stream.Writable({
          objectMode: true,
          write(entry, _, done) {
            if (entry.path.endsWith('.txt')) {
              let content = '';
              entry.on('data', (chunk) => (content += chunk.toString()));
              entry.on('end', () => {
                buffers.push(content);
                done();
              });
            } else {
              entry.autodrain();
              done();
            }
          },
        }),
      );

      const mergedLogs = buffers.join('\n');
      const dto: CreateComplianceReportDto = {
        reportData: {
          description: 'Logs from GitHub Actions',
          details: {
            source: 'GitHub Actions',
            repo: `${owner}/${repo}`,
            runId,
            integrationId,
            scannedAt: new Date(),
            tokenType: useManager ? 'secretsManager' : 'aes',
            scannedBy: user.id,
          },
        },
        projectId,
        userId: user.id,
      };

      return await this.complianceService.create(dto, mergedLogs, user, 'github');
    } catch (err) {
      this.logger.error(`[GitHub] Failed to ingest logs for ${owner}/${repo} runId ${runId}`, err);
      throw new BadRequestException('Failed to ingest logs from GitHub');
    }
  }

  async discoverGitHubRepos(integrationId: string) {
    const integration = await this.integrationRepository.findOneOrFail({
      where: { id: integrationId },
    });

    const token = integration.useManager
      ? await this.awsSecretManagerService.getSecretValue(integration.credentials)
      : decrypt(integration.credentials, this.encryptionKey);

    const userRepos = await this.githubService.listUserRepos(token);
    const orgs = await this.githubService.listOrgs(token);

    let allRepos = [...userRepos];

    for (const org of orgs) {
      const orgRepos: any[] = await this.githubService.listOrgRepos(token, org.login);
      allRepos = allRepos.concat(orgRepos);
    }

    const saved = await this.batchProcessorService.processBatch({
      items: allRepos,
      processor: async (repo) => this.processReposBatch(repo, integrationId),
      config: {
        maxConcurrency: 10,
        batchSize: 50,
        rateLimitDelay: 1000,
      },
      onProgress: (processed, total) => {
        this.logger.log(`Saved ${processed}/${total} repositories`);
      }
    })

    return saved;
  }

  private async processReposBatch(repo: any, integrationId: string) {
    const existing = await this.integrationProjectRepository.findOne({
      where: {
        integrationId,
        externalId: repo.full_name,
      },
    });

    if (existing) {
      existing.name = repo.name;
      existing.metadata = {
        private: repo.private,
        pushedAt: repo.pushed_at,
        url: repo.html_url,
      };
      return this.integrationProjectRepository.save(existing);
    }

    return this.integrationProjectRepository.save({
      type: IntegrationType.GITHUB,
      name: repo.name,
      externalId: repo.full_name,
      metadata: {
        private: repo.private,
        pushedAt: repo.pushed_at,
        url: repo.html_url,
      },
      integrationId,
    });
  }

  async exchangeCodeForToken(code: string): Promise<string> {
    return this.retryService.withRetry({
      execute: async () => {
        const client_id = this.configService.get('GITHUB_CLIENT_ID');
        const client_secret = this.configService.get('GITHUB_CLIENT_SECRET');

        const response = await axios.post(
          'https://github.com/login/oauth/access_token',
          {
            client_id,
            client_secret,
            code,
          },
          {
            headers: { Accept: 'application/json' },
          },
        );

        if (response.data.error) {
          throw new Error(`GitHub OAuth failed: ${response.data.error_description}`);
        }

        return response.data.access_token;
      },
      serviceName: 'github-oauth',
      maxRetries: 3,
      retryDelay: (retryCount) => Math.min(1000 * Math.pow(2, retryCount), 10000),
    });
  }
}