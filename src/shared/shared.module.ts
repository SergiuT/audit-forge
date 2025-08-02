import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '@/modules/auth/entities/user.entity';
import { OpenAIService } from './services/openai.service';
import { CacheService } from './services/cache.service';
import { RetryService } from './services/retry.service';
import { CircuitBreakerService } from './services/circuit-breaker.service';
import { HealthService } from './services/health.service';
import { S3Service } from './services/s3.service';
import { AWSSecretManagerService } from './services/aws-secret.service';
import { PdfService } from './services/pdf.service';
import { GitHubService } from './services/github.service';
import { GCPService } from './services/gcp.service';
import { RateLimiterService } from './services/rate-limiter.service';
import { PineconeService } from './services/pinecone.service';

@Global()
@Module({
    imports: [
        ConfigModule,
        TypeOrmModule.forFeature([User]), // For health service
    ],
    providers: [
        // Core utility services
        CacheService,
        RetryService,
        CircuitBreakerService,
        HealthService,

        // AI and external services
        OpenAIService,
        PineconeService,

        // Cloud services
        S3Service,
        AWSSecretManagerService,
        GitHubService,
        GCPService,

        // Document services
        PdfService,

        // Rate limiting
        RateLimiterService,
    ],
    exports: [
        // Export all services so they can be used in other modules
        CacheService,
        RetryService,
        CircuitBreakerService,
        HealthService,
        OpenAIService,
        S3Service,
        AWSSecretManagerService,
        PdfService,
        GitHubService,
        GCPService,
        RateLimiterService,
        PineconeService
    ],
})
export class SharedModule { } 