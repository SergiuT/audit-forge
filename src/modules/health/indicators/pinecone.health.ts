import { Injectable } from '@nestjs/common';
import { PineconeService } from '@/shared/services/pinecone.service';

@Injectable()
export class PineconeHealthIndicator {
  constructor(private pineconeService: PineconeService) {}

  async isHealthy(key: string): Promise<Record<string, any>> {
    try {
      await this.pineconeService.healthCheck();
      return { [key]: { status: 'up' } };
    } catch (e) {
      return { [key]: { status: 'down', error: e.message } };
    }
  }
}