
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';
import { HealthController } from './health.controller';
import { OpenAIHealthIndicator } from './indicators/openai.health';
import { PineconeHealthIndicator } from './indicators/pinecone.health';
import { RedisHealthIndicator } from './indicators/redis.health';

@Module({
  imports: [TerminusModule, HttpModule],
  controllers: [HealthController],
  providers: [
    OpenAIHealthIndicator,
    PineconeHealthIndicator,
    RedisHealthIndicator,
  ],
})
export class HealthModule {}