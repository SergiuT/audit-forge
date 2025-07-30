import 'dotenv/config';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './modules/auth/entities/user.entity';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtStrategy } from './modules/auth/strategies/jwt.strategy';
import { validate } from './config/env.config';
import { ThrottlerModule } from '@nestjs/throttler';
import { FindingsModule } from './modules/findings/findings.module';
import { ChecklistModule } from './modules/checklist/checklist.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { ProjectsModule } from './modules/project/project.module';
import { AuditTrailModule } from './modules/audit-trail/audit.module';
import { AIAgentsModule } from './modules/ai-agents/ai-agents.module';
import { SharedModule } from './shared/shared.module';
import { HealthController } from './common/controllers/health.controller';

@Module({
  imports: [
    // Global configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate
    }),

    // Rate limiting
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60000, // 1 minute
          limit: 100, // Increased limit for better UX
        },
      ],
    }),

    // Database configuration with improved settings
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST'),
        port: configService.get('DB_PORT'),
        username: configService.get('DB_USERNAME'),
        password: configService.get('DB_PASSWORD'),
        database: configService.get('DB_DATABASE'),
        entities: ['dist/**/*.entity{.ts,.js}'],
        synchronize: configService.get('NODE_ENV') !== 'production',
        logging: configService.get('NODE_ENV') === 'development' ? ['error', 'warn'] : false,
        migrations: ['dist/database/migrations/*{.ts,.js}'],
        migrationsRun: true,
        // Performance optimizations
        extra: {
          connectionLimit: 10,
          acquireTimeout: 60000,
          timeout: 60000,
        },
        // Connection pooling
        poolSize: 10,
        retryAttempts: 3,
        retryDelay: 3000,
      }),
      inject: [ConfigService],
    }),

    // Shared utilities (global)
    SharedModule,

    // Feature Modules
    AuthModule,
    ComplianceModule,
    FindingsModule,
    ChecklistModule,
    IntegrationsModule,
    ProjectsModule,
    AuditTrailModule,
    AIAgentsModule
  ],
  controllers: [
    HealthController, // Global health check endpoints
  ],
  providers: [
    JwtStrategy
  ],
})
export class AppModule { }
