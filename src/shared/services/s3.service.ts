import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { RetryService } from './retry.service';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import * as zlib from 'zlib';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);

  constructor(
    private configService: ConfigService,
    private retryService: RetryService,
  ) { }

  createDefaultClient(): { client: S3Client, bucket: string } {
    const region = this.configService.get<string>('AWS_REGION');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
    const bucket = this.configService.get<string>('S3_BUCKET_NAME');

    if (!region || !accessKeyId || !secretAccessKey || !bucket) {
      this.logger.warn('AWS S3 configuration is incomplete. File upload features will be disabled.');
      throw new Error('AWS S3 configuration is incomplete.');
    }

    const client = new S3Client({
      region,
      endpoint: `https://s3.${region}.amazonaws.com`,
      forcePathStyle: false,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    return { client, bucket };
  }

  async uploadFile(s3Client: S3Client, bucket: string, logContent: string, key: string): Promise<string> {
    return this.retryService.withRetry({
      execute: async () => {
        const command = new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: logContent,
          ContentType: 'text/plain',
        });

        await s3Client.send(command);
        return key;
      },
      serviceName: 's3-upload',
      maxRetries: 3,
      retryDelay: (retryCount) => Math.min(1000 * Math.pow(2, retryCount), 10000),
    });
  }

  async getFile(s3Client: S3Client, bucket: string, key: string): Promise<Buffer> {
    return this.retryService.withRetry({
      execute: async () => {
        const command = new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        });

        const data = await s3Client.send(command);

        const chunks: Buffer[] = [];
        const stream = data.Body as Readable;

        for await (const chunk of stream) {
          chunks.push(chunk);
        }

        return Buffer.concat(chunks);
      },
      serviceName: 's3-download',
      maxRetries: 3,
      retryDelay: (retryCount) => Math.min(1000 * Math.pow(2, retryCount), 10000),
    });
  }

  generateKey(filename: string, prefix = 'compliance-report'): string {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const extension = filename.split('.').pop();
    return `${prefix}/${timestamp}-${randomString}.${extension}`;
  }

  async checkBucketAccess(bucketName: string, credentials: any, region: string): Promise<boolean> {
    const client = new S3Client({
      region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
      },
    });

    try {
      await client.send(new ListObjectsV2Command({
        Bucket: bucketName,
        MaxKeys: 1
      }));
      return true;
    } catch (error) {
      this.logger.warn(`[S3Service] Failed to check bucket access for ${bucketName}: ${error}`);
      return false;
    }
  }

  async fetchCloudTrailLogs(s3Client: S3Client, prefix: string, bucket?: string): Promise<string[]> {
    // Use provided bucket or fall back to configured bucket
    const targetBucket = bucket;

    if (!targetBucket) {
      throw new Error('No S3 bucket specified for CloudTrail logs');
    }

    return this.retryService.withRetry({
      execute: async () => {
        // Get current date for recent logs
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
        const currentDay = String(now.getDate()).padStart(2, '0');

        // Try current day first, then previous day
        const recentPrefixes = [
          `${prefix}/${currentYear}/${currentMonth}/${currentDay}/`,
          `${prefix}/${currentYear}/${currentMonth}/${String(now.getDate() - 1).padStart(2, '0')}/`,
          `${prefix}/${currentYear}/${currentMonth}/`,
        ];

        let logs: string[] = [];
        let foundLogs = false;

        for (const recentPrefix of recentPrefixes) {
          if (foundLogs) break;

          try {
            const list = await s3Client.send(new ListObjectsV2Command({
              Bucket: targetBucket,
              Prefix: recentPrefix,
            }));

            if (list.Contents && list.Contents.length > 0) {
              // Sort by LastModified to get the most recent files
              const sortedObjects = list.Contents.sort((a, b) =>
                (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0)
              );

              // Take only the 3 most recent log files
              const recentObjects = sortedObjects.slice(0, 1);

              for (const obj of recentObjects) {
                const key = obj.Key!;
                const getCmd = new GetObjectCommand({ Bucket: targetBucket, Key: key });
                const response = await s3Client.send(getCmd);
                const stream = response.Body as Readable;

                const chunks: Uint8Array[] = [];

                try {
                  const contentStream = key.endsWith('.gz') ? stream.pipe(zlib.createGunzip()) : stream;

                  for await (const chunk of contentStream) {
                    chunks.push(chunk);
                  }

                  logs.push(Buffer.concat(chunks).toString('utf-8'));
                  this.logger.log(`Processed recent log file: ${key}`);
                } catch (err) {
                  this.logger.error(`Failed to process log file: ${key}`, err);
                }
              }

              foundLogs = true;
              this.logger.log(`Found ${logs.length} recent CloudTrail log files from ${targetBucket}/${recentPrefix}`);
            }
          } catch (err) {
            this.logger.warn(`No logs found in ${recentPrefix}, trying next prefix`);
          }
        }

        if (logs.length === 0) {
          this.logger.warn(`No recent CloudTrail logs found in any recent prefixes`);
        }

        return logs;
      },
      serviceName: 's3-cloudtrail-logs',
      maxRetries: 3,
      retryDelay: (retryCount) => Math.min(1000 * Math.pow(2, retryCount), 10000),
    });
  }
}
