import 'dotenv/config';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtStrategy } from './modules/auth/strategies/jwt.strategy';
import { validate } from './config/env.config';
import { FindingsModule } from './modules/findings/findings.module';
import { ChecklistModule } from './modules/checklist/checklist.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { ProjectsModule } from './modules/project/project.module';
import { AuditTrailModule } from './modules/audit-trail/audit.module';
import { AIAgentsModule } from './modules/ai-agents/ai-agents.module';
import { SharedModule } from './shared/shared.module';
import { HealthController } from './common/controllers/health.controller';
import { RateLimiterService } from './shared/services/rate-limiter.service';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { APP_GUARD, Reflector } from '@nestjs/core';

@Module({
  imports: [
    // Global configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate
    }),

    // Database configuration
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

        // Connection Pooling Configuration
        extra: {
          // Pool size configuration
          max: 20,                    // Maximum number of connections in pool
          min: 5,                     // Minimum number of connections in pool

          // Connection lifecycle timeouts
          acquireTimeoutMillis: 30000, // Time to acquire connection (30s)
          createTimeoutMillis: 30000,  // Time to create new connection (30s)
          destroyTimeoutMillis: 5000,  // Time to destroy connection (5s)
          idleTimeoutMillis: 30000,    // Time before idle connection is closed (30s)
          reapIntervalMillis: 1000,    // How often to check for idle connections (1s)

          // Connection validation
          validateOnBorrow: true,      // Validate connection before use
          validateOnReturn: false,     // Don't validate on return (performance)
        },

        // SSL configuration (for production)
        ssl: configService.get('NODE_ENV') === 'production' ? { rejectUnauthorized: false } : false,
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
    JwtStrategy,
    RateLimiterService,
    RateLimitGuard,
    Reflector,
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    }
  ],
  exports: [
    RateLimiterService,
  ]
})
export class AppModule { }
