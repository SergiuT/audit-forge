import { Injectable } from "@nestjs/common";
import { OpenAIService } from "@/shared/services/openai.service";

@Injectable()
export class OpenAIHealthIndicator {
  constructor(private openaiService: OpenAIService) {}

  async isHealthy(key: string): Promise<Record<string, any>> {
    const healthy = await this.openaiService.healthCheck();
    return {
      [key]: {
        status: healthy ? 'up' : 'down',
      },
    };
  }
}