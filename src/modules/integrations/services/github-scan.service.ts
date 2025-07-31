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
import { Readable } from 'stream';
import { IntegrationsService } from "../integrations.service";
import { ComplianceService } from "@/modules/compliance/compliance.service";
import { AuditTrailService } from "@/modules/audit-trail/audit.service";
import { AuditAction } from "@/modules/audit-trail/entities/audit-event.entity";
import { RetryService } from "@/shared/services/retry.service";
import { CircuitBreakerService } from "@/shared/services/circuit-breaker.service";
import { createOAuthState } from "@/shared/utils/oauth-state.util";

const pipeline = promisify(stream.pipeline);

@Injectable()
export class GithubScanService {
  private readonly logger = new Logger(IntegrationsService.name);
  constructor(
    @InjectRepository(IntegrationProject)
    private integrationProjectRepository: Repository<IntegrationProject>,
    @InjectRepository(Integration)
    private integrationRepository: Repository<Integration>,

    private githubService: GitHubService,
    private readonly complianceService: ComplianceService,
    private readonly awsSecretManagerService: AWSSecretManagerService,
    private configService: ConfigService,
    private readonly auditTrailService: AuditTrailService,
    private readonly retryService: RetryService,
    private readonly circuitBreakerService: CircuitBreakerService,
) { }

  async generateAuthUrl(projectId: string, userId: string): Promise<{ authUrl: string }> {
    return this.retryService.withRetry({
      execute: () => this.circuitBreakerService.execute(
        'github-generate-auth-url',
        async () => {
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
      ),
      maxRetries: 3,
      retryDelay: (retryCount) => Math.min(1000 * Math.pow(2, retryCount), 10000),
    });
  }

  async createOrUpdateGitHubIntegration(token: string, userId: string, projectId: string): Promise<Integration> {
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
        secretRef = encrypt(token);
      }

      existing.name = integrationName;
      existing.updatedAt = new Date();
      existing.credentials = secretRef;

      await this.discoverGitHubRepos(existing.id);
      return existing;
    }

    // New integration
    if (this.useAWSSecretsManager()) {
      secretRef = await this.awsSecretManagerService.createSecret(`github-${userId}-${Date.now()}`, token);
    } else {
      secretRef = encrypt(token);
    }

    const integration = this.integrationRepository.create({
      type: IntegrationType.GITHUB,
      name: integrationName,
      credentials: secretRef,
      useManager: this.useAWSSecretsManager(),
      userId,
      projectId,
    });

    const saved = await this.integrationRepository.save(integration)
    await this.discoverGitHubRepos(saved.id);

    return saved;
  }

  async scanGitHubIntegrationProjects(projectId: string, selectedRepos: string[], userId: string) {
    this.logger.log(`Scanning GitHub projects. ProjectId: ${projectId}, SelectedRepos: ${JSON.stringify(selectedRepos)}`);

    // Build the where condition properly
    let whereCondition: any = {
      type: IntegrationType.GITHUB,
    };

    // Only add externalId filter if selectedRepos is not empty
    if (selectedRepos && selectedRepos.length > 0) {
      whereCondition.externalId = In(selectedRepos);
      this.logger.log(`Filtering by specific repos: ${selectedRepos.join(', ')}`);
    } else {
      this.logger.log('No specific repos provided - this will scan ALL GitHub repos');
    }

    this.logger.log(`Where condition: ${JSON.stringify(whereCondition)}`);

    const integrationProjects = await this.integrationProjectRepository.find({
      where: whereCondition,
      relations: ['integration'],
    });

    this.logger.log(`Found ${integrationProjects.length} integration projects`);
    integrationProjects.forEach(p => this.logger.log(`- ${p.externalId}`));

    for (const project of integrationProjects) {
      const { integration } = project;
      if (!integration || integration.projectId != projectId) continue;

      const token = integration.useManager
        ? await this.awsSecretManagerService.getSecretValue(integration.credentials)
        : decrypt(integration.credentials);

      const [owner, repo] = project.externalId.split('/');

      const workflowRuns = await this.githubService.getWorkflowRuns(token, owner, repo);
      const sortedRuns = workflowRuns.sort((a, b) => b.id - a.id); // newest first

      const runsToScan = sortedRuns.filter((run) => {
        if (project.lastRunId && run.id <= project.lastRunId) return false;
        return true;
      });

      if (!runsToScan.length) {
        this.logger.log(`[SCAN] No new runs to scan for ${project.externalId}`);
        continue;
      }

      for (const run of workflowRuns) {
        const existingReport = await this.complianceService.findOneByRunId(run.id);

        if (existingReport) {
          this.logger.warn(`🟡 Skipping run ${run.id} for ${owner}/${repo} — report already exists (ID: ${existingReport.id})`);
          return null;
        }
        try {
          await this.processGitHubLogs({
            token,
            owner,
            repo,
            runId: run.id,
            projectId: +projectId,
            useManager: integration?.useManager,
            integrationId: integration?.id,
            userId: +userId,
          });

          await this.auditTrailService.logEvent({
            userId: Number(integration.userId),
            projectId: +projectId,
            action: AuditAction.SCAN_COMPLETED,
            resourceType: 'IntegrationProject',
            resourceId: integration.id,
            metadata: {
              type: IntegrationType.GITHUB,
              githubProjectId: project.externalId,
            },
          });
        } catch (err) {
          this.logger.warn(`Failed to process run ${run.id} for ${project.externalId}`, err);
          continue;
        }
      }

      const newestRun = runsToScan[0]; // already sorted by id desc

      project.lastRunId = newestRun.id;
      project.lastScannedAt = new Date();

      await this.integrationProjectRepository.save(project);
    }
  }

  async processGitHubLogs({
    token,
    owner,
    repo,
    runId,
    projectId,
    useManager,
    integrationId,
    userId,
  }: {
    token: string;
    owner: string;
    repo: string;
    runId: number;
    projectId: number;
    useManager: boolean;
    integrationId: string;
    userId: number;
  }) {
    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/logs`;

      const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        headers: {
          Authorization: `token ${token}`,
          'User-Agent': 'AuditForge',
          Accept: 'application/vnd.github.v3+json',
        },
      });

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

      this.logger.log('Merged logs', mergedLogs, null, 4);
      // Simulate uploaded .txt file using a Buffer
      const fakeFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: `github-logs-${Date.now()}.txt`,
        encoding: '7bit',
        mimetype: 'text/plain',
        buffer: Buffer.from(mergedLogs),
        size: Buffer.byteLength(mergedLogs),
        stream: Readable.from(Buffer.from(mergedLogs)),
        destination: '',
        filename: '',
        path: '',
      };

      const dto: CreateComplianceReportDto = {
        reportData: {
          description: 'Logs from GitHub Actions',
          details: {
            source: 'GitHub Actions',
            repo: `${owner}/${repo}`,
            runId,
            integrationId,
            scannedAt: new Date().toISOString(),
            tokenType: useManager ? 'secretsManager' : 'aes',
            scannedBy: 1, // optional
          },
        },
        projectId,
        userId: 1,
      };

      return await this.complianceService.create(dto, Number(userId), fakeFile, 'github-logs');
    } catch (err) {
      console.error('GitHub log ingestion error:', err);
      throw new BadRequestException('Failed to ingest logs from GitHub');
    }
  }

  async discoverGitHubRepos(integrationId: string) {
    const integration = await this.integrationRepository.findOneOrFail({
      where: { id: integrationId },
    });

    const token = integration.useManager
      ? await this.awsSecretManagerService.getSecretValue(integration.credentials)
      : decrypt(integration.credentials);

    const userRepos = await this.githubService.listUserRepos(token);
    const orgs = await this.githubService.listOrgs(token);

    let allRepos = [...userRepos];

    for (const org of orgs) {
      const orgRepos: any[] = await this.githubService.listOrgRepos(token, org.login);
      allRepos = allRepos.concat(orgRepos);
    }

    const saved = await Promise.all(
      allRepos.map(async (repo) => {
        const existing = await this.integrationProjectRepository.findOne({
          where: {
            integrationId: integration.id,
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
          integrationId: integration.id,
        });
      })
    );

    return saved;
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