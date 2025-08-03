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
import { User } from "@/modules/auth/entities/user.entity";
import { ComplianceReport } from "@/modules/compliance/entities/compliance-report.entity";

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
    userId: number;
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
    const assumedAccountId = await this.awsSecretManagerService.getAwsAccountIdFromCreds({
      accessKeyId: creds.AccessKeyId!,
      secretAccessKey: creds.SecretAccessKey!,
      sessionToken: creds.SessionToken,
      expiration: creds.Expiration,
    });

    this.logger.log(`[AWS] Discovered ${accounts.length} AWS accounts`);
    for (const acc of accounts) {
      if (acc.id === assumedAccountId) {
        const cloudTrailBucket = await this.discoverCloudTrailBucket(creds, region, acc.id);

        this.logger.log(`[AWS] Discovered CloudTrail bucket ${cloudTrailBucket} for account ${acc.id}`);
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
            bucket: cloudTrailBucket,
          },
        });
      } else {
        this.logger.warn(`[AWS] Skipping account ${acc.id} - not accessible with assumed role`);
      }
    }

    return integration
  }

  async scanAWSIntegrationProjects(projectId: string, user: User) {
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
        this.logger.log(`[AWS] Starting scan for account ${project.externalId}`);
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

        await this.s3Service.setCustomClient(s3);

        await this.processAwsLogs({
          prefix: project.metadata?.prefix + project.metadata?.region || `AWSLogs/${project.externalId}/CloudTrail/${project.metadata?.region}`,
          projectId: +projectId,
          userId: Number(integration.userId),
          user,
          bucket: project.metadata?.bucket || `aws-cloudtrail-logs-${project.externalId}`,
        });

        project.lastScannedAt = new Date();
        await this.integrationProjectRepository.save(project);

        this.logger.log(`[AWS] Successfully scanned account ${project.externalId}`);
      } catch (err) {
        this.logger.warn(`[AWS] Failed to scan ${project.externalId}`, err);
      }
    }
  }

  async processAwsLogs({ prefix = 'AWSLogs', projectId, userId = 1, user, bucket }: { prefix: string; projectId: number; userId?: number, user: User, bucket?: string }) {
    const rawLogs = await this.s3Service.fetchCloudTrailLogs(prefix, bucket);
    this.logger.log(`Processing ${rawLogs.length} CloudTrail log files`);

    if (rawLogs.length === 0) {
      this.logger.warn(`No CloudTrail logs found to process`);
      return [];
    }

    // Combine all logs into a single file
    const combinedTextLog = rawLogs.join('\n\n');

    const filename = `aws-cloudtrail-${Date.now()}.txt`;
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

    const result = await this.complianceService.create(
      {
        reportData: {
          description: `AWS CloudTrail Logs Analysis`,
          details: {
            source: 'AWS CloudTrail',
            prefix,
            logFilesProcessed: rawLogs.length,
            ingestedAt: new Date(),
            bucket: bucket || 'unknown',
          },
        },
        userId,
        projectId,
        status: 'pending',
        fileDataKey: '',
      },
      fakeFile,
      user,
      'aws',
    );

    this.logger.log(`Created single compliance report from ${rawLogs.length} CloudTrail log files`);
    return [result];
  }

  private async discoverCloudTrailBucket(creds: any, region: string, accountId: string): Promise<string> {
    try {
      const possibleBuckets = [
        // Try with common suffixes first
        `aws-cloudtrail-logs-${accountId}-f9b46a0f`,
        `aws-cloudtrail-logs-${accountId}-50f5a902`,
        `aws-cloudtrail-logs-${accountId}-b0a4ded3`,
        // Fallback patterns
        `aws-cloudtrail-logs-${accountId}`,
        `cloudtrail-logs-${accountId}`,
        `audit-logs-${accountId}`,
      ];

      for (const bucketName of possibleBuckets) {
        try {
          await this.s3Service.checkBucketAccess(bucketName, creds, region);
          return bucketName;
        } catch (err) {
          this.logger.warn(`[AWS] Bucket ${bucketName} not accessible for account ${accountId}`);
          continue;
        }
      }

      this.logger.warn(`[AWS] No CloudTrail bucket found for account ${accountId}`);
      return `aws-cloudtrail-logs-${accountId}`;
    } catch (error) {
      this.logger.warn(`[AWS] Failed to discover CloudTrail bucket for account ${accountId}`);
      return `aws-cloudtrail-logs-${accountId}`;
    }
  }
}