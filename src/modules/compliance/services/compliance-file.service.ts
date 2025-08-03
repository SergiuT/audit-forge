import { S3Service } from "@/shared/services/s3.service";
import { Injectable, BadRequestException } from "@nestjs/common";

@Injectable()
export class ComplianceFileService {
  constructor(
    private readonly s3Service: S3Service,
  ) {}

  async uploadComplianceFile(
    logContent: string, 
    prefix?: string
  ): Promise<{
    key: string;
    content: string;
    originalName: string;
    size: number;
  }> {
    const fileKey = this.s3Service.generateKey(
      `${prefix}-${Date.now()}.txt`, 
      prefix || "compliance-report"
    );

    const uploadedKey = await this.s3Service.uploadFile(logContent, fileKey);
    const fileContent = logContent;

    return {
      key: uploadedKey,
      content: fileContent,
      originalName: `${prefix}-${Date.now()}.txt`,
      size: logContent.length,
    };
  }

  async getFileContent(fileKey: string): Promise<string> {
    try {
      const fileBuffer = await this.s3Service.getFile(fileKey);
      return fileBuffer.toString('utf-8');
    } catch (error) {
      throw new BadRequestException(
        `Error retrieving file content: ${error.message}`
      );
    }
  }
}