import { S3Service } from "@/shared/services/s3.service";
import { Injectable, BadRequestException } from "@nestjs/common";

@Injectable()
export class ComplianceFileService {
  constructor(
    private readonly s3Service: S3Service,
  ) {}

  async uploadComplianceFile(
    file: Express.Multer.File, 
    prefix?: string
  ): Promise<{
    key: string;
    content: string;
    originalName: string;
    size: number;
  }> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const fileKey = this.s3Service.generateKey(
      file.originalname, 
      prefix || "compliance-report"
    );

    const uploadedKey = await this.s3Service.uploadFile(file, fileKey);
    const fileContent = file.buffer.toString('utf-8');

    return {
      key: uploadedKey,
      content: fileContent,
      originalName: file.originalname,
      size: file.size,
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