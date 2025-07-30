import { Injectable, Logger } from "@nestjs/common";
import { Integration, IntegrationType } from "../entities/integration.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { IntegrationProject } from "../entities/integration-project.entity";
import { Repository } from "typeorm";
import { AWSSecretManagerService } from "@/shared/services/aws-secret.service";
import { ComplianceService } from "@/modules/compliance/compliance.service";
import { S3Service } from "@/shared/services/s3.service";
import { IntegrationsService } from "../integrations.service";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

@Injectable()
export class AWSScanService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    @InjectRepository(IntegrationProject)
    private integrationProjectRepository: Repository<IntegrationProject>,
    @InjectRepository(Integration)
    private integrationRepository: Repository<Integration>,

    private readonly awsSecretManagerService: AWSSecretManagerService,
    private readonly complianceService: ComplianceService,
    private readonly s3Service: S3Service,
  ) { }

  async connectAWSRole({
    assumeRoleArn,
    externalId,
    region = 'eu-central-1',
    projectId,
    userId,
  }: {
    assumeRoleArn: string;
    externalId?: string;
    region?: string;
    projectId: string;
    userId: string;
  }): Promise<Integration> {
    // Optional: Validate it works
    const creds = await this.awsSecretManagerService.assumeAwsRole(assumeRoleArn, externalId);
    const existing = await this.integrationRepository.findOne({
      where: {
        type: IntegrationType.AWS,
        userId,
        projectId,
        assumeRoleArn,
        externalId,
      },
    });

    if (existing) {
      this.logger.log(`[AWS Integration] Reusing existing integration for user ${userId}`);
      return existing
    }

    const integration = await this.integrationRepository.save({
      type: IntegrationType.AWS,
      name: 'AWS (AssumeRole)',
      useManager: false,
      credentials: '', // not needed
      assumeRoleArn,
      externalId,
      projectId,
      userId,
    });

    const accounts = await this.awsSecretManagerService.discoverAwsAccounts({
      accessKeyId: creds.AccessKeyId!,
      secretAccessKey: creds.SecretAccessKey!,
      sessionToken: creds.SessionToken,
      expiration: creds.Expiration,
    });

    for (const acc of accounts) {
      await this.integrationProjectRepository.save({
        integrationId: integration.id,
        type: IntegrationType.AWS,
        name: acc.name,
        externalId: acc.id,
        metadata: {
          email: acc.email,
          prefix: `AWSLogs/${acc.id}/CloudTrail/`,
          region,
          discoveredFromOrg: true,
        },
      });
    }

    return integration
  }

  async scanAWSIntegrationProjects(projectId: string) {
    const integrationProjects = await this.integrationProjectRepository.find({
      where: {
        type: IntegrationType.AWS,
        includedInScans: true,
      },
      relations: ['integration'],
    });

    for (const project of integrationProjects) {
      const { integration } = project;
      if (!integration || integration.projectId != projectId) continue;

      try {
        const creds = await this.awsSecretManagerService.assumeAwsRole(
          integration.assumeRoleArn!,
          integration.externalId || undefined
        );

        const s3Creds = {
          accessKeyId: creds.AccessKeyId!,
          secretAccessKey: creds.SecretAccessKey!,
          sessionToken: creds.SessionToken,
          expiration: creds.Expiration,
        };

        const assumedAccountId = await this.awsSecretManagerService.getAwsAccountIdFromCreds(s3Creds);

        if (project.externalId !== assumedAccountId) {
          this.logger.warn(`[AWS] Skipping project ${project.externalId} — does not match assumed role account ${assumedAccountId}`);
          continue;
        }

        const s3 = new S3Client({
          region: project.metadata?.region || 'us-east-1',
          credentials: {
            accessKeyId: s3Creds.accessKeyId,
            secretAccessKey: s3Creds.secretAccessKey,
            sessionToken: s3Creds.sessionToken,
            expiration: s3Creds.expiration,
          },
        });

        // Override default S3 client for this run
        await this.s3Service.setCustomClient(s3);

        await this.processAwsLogs({
          prefix: project.metadata?.prefix || `AWSLogs/${project.externalId}/CloudTrail/`,
          projectId: +projectId,
          userId: Number(integration.userId),
        });

        project.lastScannedAt = new Date();
        await this.integrationProjectRepository.save(project);

      } catch (err) {
        this.logger.warn(`[AWS] Failed to scan ${project.externalId}`, err);
      }
    }
  }

  async processAwsLogs({ prefix = 'AWSLogs/', projectId, userId = 1 }: { prefix: string; projectId: number; userId?: number }) {
    const rawLogs = await this.s3Service.fetchCloudTrailLogs(prefix);
    this.logger.log("CEPLM", JSON.stringify(rawLogs, null, 4));

    let combinedTextLog = '';

    for (const logContent of rawLogs) {
      combinedTextLog += `${logContent}\n\n`;
    }

    const filename = `aws-${Date.now()}.txt`;
    const fakeFile: Express.Multer.File = {
      originalname: filename,
      mimetype: 'text/plain',
      buffer: Buffer.from(combinedTextLog),
      fieldname: 'file',
      size: combinedTextLog.length,
      encoding: '7bit',
      stream: null as any,
      destination: '',
      filename: '',
      path: '',
    };

    return this.complianceService.create(
      {
        reportData: {
          description: 'Logs from AWS',
          details: {
            source: 'AWS CloudTrail',
            prefix,
            ingestedAt: new Date().toISOString(),
          },
        },
        userId,
        projectId,
        status: 'pending',
        fileDataKey: '',
      },
      1,
      fakeFile,
      'aws-logs',
    );
  }
}