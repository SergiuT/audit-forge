import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import { Integration } from './entities/integration.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { decrypt, encrypt } from '@/shared/utils/encryption.util';
import { Repository } from 'typeorm';
import { AWSSecretManagerService } from '@/shared/services/aws-secret.service';
import { ComplianceReport } from '../compliance/entities/compliance-report.entity';
import { User } from '../auth/entities/user.entity';

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);
  private encryptionKey: string;
  
  constructor(
    @InjectRepository(Integration)
    private integrationRepository: Repository<Integration>,
    @InjectRepository(ComplianceReport)
    private complianceReportRepository: Repository<ComplianceReport>,
    
    private readonly awsSecretManagerService: AWSSecretManagerService,
  ) {}

  async onModuleInit(): Promise<void> {
    const key = await this.awsSecretManagerService.getSecretWithFallback('encryption-key', 'ENCRYPTION_KEY');
    this.encryptionKey = key;
  }

  async create(dto: CreateIntegrationDto, userId: number): Promise<Integration> {
    const { credentials, useManager, name } = dto;
    let storedCredential = '';

    if (useManager) {
      storedCredential = await this.awsSecretManagerService.createSecret(name, credentials);
    } else {
      storedCredential = encrypt(credentials, this.encryptionKey);
    }

    const integration = this.integrationRepository.create({
      ...dto,
      credentials: storedCredential,
      userId,
    });

    return this.integrationRepository.save(integration);
  }

  async getById(id: string, user: User): Promise<Integration & { decryptedCredentials: string }> {
    const integration = await this.integrationRepository.findOneOrFail({ where: { id, userId: user.id } });

    let decrypted = '';
    if (integration.useManager) {
      decrypted = await this.awsSecretManagerService.getSecretValue(integration.credentials);
    } else {
      decrypted = decrypt(integration.credentials, this.encryptionKey);
    }

    return { ...integration, decryptedCredentials: decrypted };
  }

  async getScanHistoryForProject(projectId: string): Promise<any[]> {
    const rawReports = await this.complianceReportRepository
    .createQueryBuilder('report')
    .where('report.projectId = :projectId', { projectId })
    .orderBy('report.createdAt', 'DESC')
    .getMany();
  
    return rawReports.map((r) => ({
      reportId: r.id,
      createdAt: r.createdAt,
      source: r.source,
      complianceScore: r.complianceScore,
      categoryScores: r.categoryScores,
      fileDataKey: r.fileDataKey,
      summaryGenerated: !!r.aiSummary,
      aiSummary: r.aiSummary,
      status: r.status,
    }));
  }

  async deleteIntegration(id: string, user: User) {
    const integration = await this.integrationRepository.findOne({ where: { id, userId: user.id } });
  
    if (!integration) {
      throw new NotFoundException(`Integration with ID ${id} not found`);
    }
  
    // Delete secret if stored in Secrets Manager
    if (integration.useManager && integration.credentials) {
      try {
        await this.awsSecretManagerService.deleteSecret(integration.credentials);
        this.logger.log(`Deleted AWS secret for integration ${id}`);
      } catch (err) {
        this.logger.warn(`Failed to delete AWS secret for integration ${id}`, err);
      }
    }
  
    // Delete the integration (cascades will handle children)
    await this.integrationRepository.delete({ id });
  }  
}
