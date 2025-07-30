import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import * as zlib from 'zlib';

@Injectable()
export class S3Service {
  private s3Client: S3Client;
  private bucket?: string;
  private isConfigured: boolean = false;
  private readonly logger = new Logger(S3Service.name);

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const region = this.configService.get<string>('AWS_REGION');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
    const bucket = this.configService.get<string>('S3_BUCKET_NAME');

    if (!region || !accessKeyId || !secretAccessKey || !bucket) {
      this.logger.warn('AWS S3 configuration is incomplete. File upload features will be disabled.');
      return;
    }

    try {
      this.s3Client = new S3Client({
        region,
        endpoint: `https://s3.${region}.amazonaws.com`,
        forcePathStyle: false,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
      this.bucket = bucket;
      this.isConfigured = true;
      this.logger.log('AWS S3 client initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize AWS S3 client:', error);
    }
  }

  setCustomClient(client: S3Client) {
    this.s3Client = client;
    this.isConfigured = true;
    this.logger.log('[S3Service] Using custom S3 client (AssumeRole session)');
  }

  resetClient() {
    this.onModuleInit(); // Re-initialize with default .env credentials
  }

  // Method to upload a file to S3
  private checkS3Configuration() {
    if (!this.isConfigured || !this.bucket) {
      throw new Error('AWS S3 is not configured. Please check your environment variables.');
    }
  }

  async uploadFile(file: Express.Multer.File, key: string): Promise<string> {
    this.checkS3Configuration();

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    await this.s3Client.send(command);
    return key;
  }

  async getFile(key: string): Promise<Buffer> {
    this.checkS3Configuration();

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const data = await this.s3Client.send(command);

    // Readable stream, you can use .promise() if you want to wait for the stream to be fully read
    const chunks: Buffer[] = [];
    const stream = data.Body as Readable;

    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    // Concatenate all chunks into a single buffer
    return Buffer.concat(chunks);
  }

  generateKey(filename: string, prefix = 'compliance-report'): string {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const extension = filename.split('.').pop();
    return `${prefix}/${timestamp}-${randomString}.${extension}`;
  }

  async fetchCloudTrailLogs(prefix: string): Promise<string[]> {
    const list = await this.s3Client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix }));
  
    const logs: string[] = [];
  
    for (const obj of list.Contents || []) {
      const key = obj.Key!;
      const getCmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
      const response = await this.s3Client.send(getCmd);
      const stream = response.Body as Readable;
  
      const chunks: Uint8Array[] = [];
  
      try {
        const contentStream = key.endsWith('.gz') ? stream.pipe(zlib.createGunzip()) : stream;
  
        for await (const chunk of contentStream) {
          chunks.push(chunk);
        }
  
        logs.push(Buffer.concat(chunks).toString('utf-8'));
      } catch (err) {
        this.logger.error(`Failed to process log file: ${key}`, err);
      }
    }
  
    return logs;
  }
}
