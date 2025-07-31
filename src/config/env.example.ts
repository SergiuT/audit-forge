/**
 * Environment Configuration Example
 * 
 * Copy this configuration to your .env file and update the values
 * according to your environment setup.
 */

export const ENV_EXAMPLE = {
    // Application Configuration
    NODE_ENV: 'development',
    PORT: 3000,

    // Database Configuration
    DB_HOST: 'localhost',
    DB_PORT: 5432,
    DB_USERNAME: 'postgres',
    DB_PASSWORD: 'your_password_here',
    DB_DATABASE: 'compliance_db',

    // JWT Authentication
    JWT_SECRET: 'your_super_secret_jwt_key_change_this_in_production',
    JWT_EXPIRATION: '15m',
    JWT_REFRESH_SECRET: 'your_super_secret_refresh_key_change_this_in_production',
    JWT_REFRESH_EXPIRATION: '7d',

    // OpenAI Configuration (REQUIRED)
    OPENAI_API_KEY: 'sk-your-openai-api-key-here',
    OPENAI_MODEL: 'gpt-3.5-turbo',

    // AWS Configuration (Optional)
    AWS_REGION: 'us-east-1',
    AWS_ACCESS_KEY_ID: 'your_aws_access_key',
    AWS_SECRET_ACCESS_KEY: 'your_aws_secret_key',
    S3_BUCKET_NAME: 'your-s3-bucket-name',
    CLOUDTRAIL_BUCKET_NAME: 'your-cloudtrail-bucket-name',
    ENABLE_SECRETS_MANAGER: 'false',

    // Performance & Caching
    ENABLE_CACHING: 'true',
    REDIS_URL: 'redis://localhost:6379',

    // Retry Configuration
    RATE_LIMIT_WINDOW_MS: 60000,
    RATE_LIMIT_MAX_REQUESTS: 100,

    // Integration Specific (Optional)
    GITHUB_CLIENT_ID: 'your_github_client_id',
    GITHUB_CLIENT_SECRET: 'your_github_client_secret',
    CLOUDFLARE_API_TOKEN: 'your_cloudflare_api_token',
    GOOGLE_APPLICATION_CREDENTIALS: 'path/to/service-account-key.json',
};

/**
 * Required Environment Variables:
 * - OPENAI_API_KEY: Required for AI-powered compliance analysis
 * - JWT_SECRET: Required for access token signing
 * - JWT_REFRESH_SECRET: Required for refresh token signing
 * - DB_HOST, DB_USERNAME, DB_PASSWORD, DB_DATABASE: Required for database connection
 * 
 * Optional Environment Variables:
 * - AWS_*: Required only if using AWS integrations
 * - GITHUB_*: Required only if using GitHub integrations
 * - CLOUDFLARE_*: Required only if using Cloudflare integrations
 * - REDIS_URL: Required only if using Redis for caching
 * - ENABLE_CACHING: Improves performance by caching AI responses
 */ 