import { Injectable, Logger } from "@nestjs/common";
import { Integration, IntegrationType } from "../entities/integration.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { IntegrationProject } from "../entities/integration-project.entity";
import { Repository } from "typeorm";
import { AWSSecretManagerService } from "@/shared/services/aws-secret.service";
import { ComplianceService } from "@/modules/compliance/compliance.service";
import { S3Service } from "@/shared/services/s3.service";
import { IntegrationsService } from "../integrations.service";
import { S3Client } from "@aws-sdk/client-s3";
import { User } from "@/modules/auth/entities/user.entity";
import { BatchProcessorService } from "@/shared/services/batch-processor.service";

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
    private readonly batchProcessorService: BatchProcessorService,
  ) { }

  async connectAWSRole({
    assumeRoleArn,
    externalId,
    region = 'eu-central-1',
    projectId,
    userId,
    bucketName,
  }: {
    assumeRoleArn: string;
    externalId?: string;
    region?: string;
    projectId: string;
    userId: number;
    bucketName?: string;
  }): Promise<Integration> {
    const creds = await this.awsSecretManagerService.assumeAwsRole(assumeRoleArn, externalId);
    const useAWSSecretsManager = await this.awsSecretManagerService.useAWSSecretsManager();

    const assumedAccountId = await this.awsSecretManagerService.getAwsAccountIdFromCreds({
      accessKeyId: creds.AccessKeyId!,
      secretAccessKey: creds.SecretAccessKey!,
      sessionToken: creds.SessionToken,
      expiration: creds.Expiration,
    });

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
      useManager: useAWSSecretsManager,
      assumeRoleArn,
      externalId,
      projectId,
      userId,
      credentials: '',
    });

    const cloudTrailBucket = await this.discoverCloudTrailBucket(creds, region, assumedAccountId, bucketName);

    this.logger.log(`[AWS] Discovered CloudTrail bucket ${cloudTrailBucket} for account ${assumedAccountId}`);
    await this.integrationProjectRepository.save({
      integrationId: integration.id,
      type: IntegrationType.AWS,
      name: `AWS Account ${assumedAccountId}`,
      externalId: assumedAccountId,
      metadata: {
        prefix: `AWSLogs/${assumedAccountId}/CloudTrail/`,
        region,
        discoveredFromOrg: true,
        bucket: cloudTrailBucket,
      },
    });

    return integration
  }

  async scanAWSIntegrationProjects(projectId: string, user: User) {
    const integrationProject = await this.integrationProjectRepository.findOne({
      where: {
        type: IntegrationType.AWS,
        includedInScans: true,
        integration: { projectId }
      },
      relations: ['integration', 'integration.project'],
    });
  
    if (!integrationProject) {
      this.logger.log('No AWS integration project found to scan');
      return;
    }
  
    const creds = await this.awsSecretManagerService.assumeAwsRole(
      integrationProject.integration.assumeRoleArn!,
      integrationProject.integration.externalId || undefined
    );
  
    const s3Creds = {
      accessKeyId: creds.AccessKeyId!,
      secretAccessKey: creds.SecretAccessKey!,
      sessionToken: creds.SessionToken,
      expiration: creds.Expiration,
    };
    
    await this.processAWSProject(integrationProject, s3Creds, user);
  }

  private async processAWSProject(
    project: IntegrationProject, 
    s3Creds: any, 
    user: User
  ) {
    try { 
      this.logger.log(`[AWS] Starting scan for account ${project.externalId}`);
      
      const assumedAccountId = await this.awsSecretManagerService.getAwsAccountIdFromCreds(s3Creds);
  
      if (project.externalId !== assumedAccountId) {
        this.logger.warn(`[AWS] Skipping project ${project.externalId} — does not match assumed role account ${assumedAccountId}`);
        return;
      }
  
      const s3Client = new S3Client({
        region: project.metadata?.region || 'us-east-1',
        credentials: {
          accessKeyId: s3Creds.accessKeyId,
          secretAccessKey: s3Creds.secretAccessKey,
          sessionToken: s3Creds.sessionToken,
          expiration: s3Creds.expiration,
        },
      });
    
      await this.processAwsLogs({
        s3Client,
        prefix: project.metadata?.prefix
          ? `${project.metadata.prefix}${project.metadata.region}`
          : `AWSLogs/${project.externalId}/CloudTrail/${project.metadata?.region}`,
        projectId: Number(project.integration.projectId),
        userId: Number(project.integration.userId),
        user,
        bucket: project.metadata?.bucket || `aws-cloudtrail-logs-${project.externalId}`,
      });

      // Update project metadata
      project.lastScannedAt = new Date();
      await this.integrationProjectRepository.save(project);
  
      this.logger.log(`[AWS] Successfully scanned account ${project.externalId}`);
    } catch (error) {
      this.logger.error(`[AWS] Failed to scan ${project.externalId}:`, error);
    }
  }

  async processAwsLogs({ s3Client, prefix = 'AWSLogs', projectId, userId = 1, user, bucket }: { s3Client: S3Client, prefix: string; projectId: number; userId?: number, user: User, bucket?: string }) {
    const rawLogs = await this.s3Service.fetchCloudTrailLogs(s3Client, prefix, bucket);
    this.logger.log(`Processing ${rawLogs.length} CloudTrail log files`);

    if (rawLogs.length === 0) {
      this.logger.warn(`No CloudTrail logs found to process`);
      return [];
    }

    // Combine all logs into a single file
    const combinedTextLog = rawLogs.join('\n\n');
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
      },
      combinedTextLog,
      user,
      'aws',
    );

    this.logger.log(`Created single compliance report from ${rawLogs.length} CloudTrail log files`);
    return [result];
  }

  private async discoverCloudTrailBucket(creds: any, region: string, accountId: string, bucketName?: string): Promise<string> {
    try {
      const possibleBuckets = [
        `aws-cloudtrail-logs-${accountId}`,
        `cloudtrail-logs-${accountId}`,
        `audit-logs-${accountId}`,
      ];

      if (bucketName) {
        possibleBuckets.unshift(bucketName);
      }

      const bucketResults = await this.batchProcessorService.processBatch({
        items: possibleBuckets,
        processor: async (bucketName) => {
          try {
            await this.s3Service.checkBucketAccess(bucketName, creds, region);
            return { bucketName, accessible: true };
          } catch (err) {
            return { bucketName, accessible: false };
          }
        },
        config: {
          maxConcurrency: 10,
          batchSize: 20,
          rateLimitDelay: 500,
        }
      });
    
      const accessibleBucket = bucketResults.success.find(result => result.accessible);
      return accessibleBucket?.bucketName || `aws-cloudtrail-logs-${accountId}`;
    } catch (error) {
      this.logger.warn(`[AWS] Failed to discover CloudTrail bucket for account ${accountId}`);
      return `aws-cloudtrail-logs-${accountId}`;
    }
  }
}