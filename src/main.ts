import 'dotenv/config'
import 'tsconfig-paths/register'
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    const app = await NestFactory.create(AppModule, {
      logger: process.env.NODE_ENV === 'production'
        ? ['error', 'warn']
        : ['log', 'error', 'warn', 'debug', 'verbose'],
    });

    // Global error handling
    app.useGlobalFilters(new GlobalExceptionFilter());

    // Global validation pipe
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true, // Strip properties that don't have decorators
      forbidNonWhitelisted: true, // Throw error if non-whitelisted properties are present
      transform: true, // Automatically transform payloads to DTO instances
      disableErrorMessages: process.env.NODE_ENV === 'production', // Hide validation errors in production
      validateCustomDecorators: true,
    }));

    // Enable CORS for development
    if (process.env.NODE_ENV !== 'production') {
      app.enableCors({
        origin: ['http://localhost:3000', 'http://localhost:3001'],
        credentials: true,
      });
    }

    // API Documentation with Swagger
    if (process.env.NODE_ENV !== 'production') {
      const config = new DocumentBuilder()
        .setTitle('AI Compliance Audit API')
        .setDescription('Comprehensive compliance audit platform with AI-powered analysis')
        .setVersion('1.0')
        .addBearerAuth()
        .addTag('Authentication', 'User authentication and authorization')
        .addTag('Compliance', 'Compliance reports and analysis')
        .addTag('Integrations', 'Third-party service integrations')
        .addTag('Health', 'System health and monitoring')
        .addTag('Projects', 'Project management')
        .addTag('Findings', 'Compliance findings management')
        .addTag('Audit Trail', 'System audit logging')
        .build();

      const document = SwaggerModule.createDocument(app, config);
      SwaggerModule.setup('api', app, document, {
        swaggerOptions: {
          persistAuthorization: true,
        },
      });

      logger.log('📚 API Documentation available at: http://localhost:3000/api');
    }

    // Graceful shutdown
    app.enableShutdownHooks();

    const port = process.env.PORT ?? 3000;
    await app.listen(port);

    logger.log(`🚀 Application is running on: http://localhost:${port}`);
    logger.log(`🏥 Health check available at: http://localhost:${port}/health`);
    logger.log(`🔧 Environment: ${process.env.NODE_ENV}`);

    // Log available integrations
    const integrations: string[] = [];
    if (process.env.AWS_REGION) integrations.push('AWS');
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) integrations.push('GCP');
    if (process.env.GITHUB_CLIENT_ID) integrations.push('GitHub');

    if (integrations.length > 0) {
      logger.log(`🔗 Available integrations: ${integrations.join(', ')}`);
    }

  } catch (error) {
    logger.error('❌ Failed to start application:', error);
    process.exit(1);
  }
}
bootstrap();
