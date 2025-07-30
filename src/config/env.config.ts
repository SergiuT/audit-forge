import { plainToClass } from 'class-transformer';
import { IsString, IsNumber, validateSync, IsOptional, IsBoolean } from 'class-validator';

class EnvironmentVariables {
  @IsNumber()
  PORT: number;

  @IsString()
  NODE_ENV: string;

  @IsString()
  DB_HOST: string;

  @IsNumber()
  DB_PORT: number;

  @IsString()
  DB_USERNAME: string;

  @IsString()
  DB_PASSWORD: string;

  @IsString()
  DB_DATABASE: string;

  @IsString()
  JWT_SECRET: string;

  @IsString()
  JWT_EXPIRATION: string;

  @IsString()
  @IsOptional()
  AWS_REGION?: string;

  @IsString()
  @IsOptional()
  AWS_ACCESS_KEY_ID?: string;

  @IsString()
  @IsOptional()
  AWS_SECRET_ACCESS_KEY?: string;

  @IsString()
  @IsOptional()
  S3_BUCKET_NAME?: string;

  @IsString()
  @IsOptional()
  CLOUDTRAIL_BUCKET_NAME?: string;

  @IsString()
  @IsOptional()
  ENABLE_SECRETS_MANAGER?: string;

  @IsString()
  OPENAI_API_KEY: string;

  @IsString()
  @IsOptional()
  OPENAI_MODEL?: string;

  @IsString()
  @IsOptional()
  OPENAI_EMBEDDING_MODEL?: string;

  @IsString()
  @IsOptional()
  REDIS_URL?: string;

  @IsBoolean()
  @IsOptional()
  ENABLE_CACHING?: boolean;

  @IsNumber()
  @IsOptional()
  MAX_RETRIES?: number;

  @IsNumber()
  @IsOptional()
  RETRY_DELAY?: number;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToClass(
    EnvironmentVariables,
    {
      PORT: parseInt(process.env.PORT || '3000', 10),
      NODE_ENV: process.env.NODE_ENV || 'development',
      DB_HOST: process.env.DB_HOST || 'localhost',
      DB_PORT: parseInt(process.env.DB_PORT || '5432', 10),
      DB_USERNAME: process.env.DB_USERNAME || 'postgres',
      DB_PASSWORD: process.env.DB_PASSWORD || 'local@pass',
      DB_DATABASE: process.env.DB_DATABASE || 'compliance_db',
      JWT_SECRET: process.env.JWT_SECRET || 'secret',
      JWT_EXPIRATION: process.env.JWT_EXPIRATION || '1h',
      AWS_REGION: process.env.AWS_REGION,
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
      S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
      CLOUDTRAIL_BUCKET_NAME: process.env.CLOUDTRAIL_BUCKET_NAME,
      ENABLE_SECRETS_MANAGER: process.env.ENABLE_SECRETS_MANAGER,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || (() => {
        if (process.env.NODE_ENV === 'production') {
          throw new Error('OPENAI_API_KEY is required in production');
        }
        return 'sk-test-key-for-development';
      })(),
      OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
      OPENAI_EMBEDDING_MODEL: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
      REDIS_URL: process.env.REDIS_URL,
      ENABLE_CACHING: process.env.ENABLE_CACHING === 'true',
      MAX_RETRIES: parseInt(process.env.MAX_RETRIES || '3', 10),
      RETRY_DELAY: parseInt(process.env.RETRY_DELAY || '1000', 10),
    },
    { enableImplicitConversion: true },
  );

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const errorMessages = errors.map((error) => {
      return `${error.property} - ${Object.values(error.constraints || {}).join(', ')}`;
    });
    throw new Error(`Environment variables validation failed: ${errorMessages.join(', ')}`);
  }
  return validatedConfig;
}