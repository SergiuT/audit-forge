import { SecretsManagerClient, CreateSecretCommand, GetSecretValueCommand, DeleteSecretCommand, PutSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { AwsCredentialIdentity } from '@aws-sdk/types';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  STSClient,
  AssumeRoleCommand,
  Credentials as STSCredentials,
  GetCallerIdentityCommand,
} from '@aws-sdk/client-sts';
import { OrganizationsClient, ListAccountsCommand } from '@aws-sdk/client-organizations';

@Injectable()
export class AWSSecretManagerService {
    private client: SecretsManagerClient;
    private readonly logger = new Logger(AWSSecretManagerService.name);
  
    constructor(private configService: ConfigService) {
      const region = this.configService.get<string>('AWS_REGION');
      const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY');
      const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
  
      if (!region || !accessKeyId || !secretAccessKey) {
        this.logger.warn('Missing AWS Secret Manager credentials or region in .env');
        return;
      }
  
      this.client = new SecretsManagerClient({
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
  
      this.logger.log('AWS Secrets Manager client initialized');
    }

    async assumeAwsRole(roleArn: string, externalId?: string): Promise<STSCredentials> {
      const region = this.configService.get<string>('AWS_REGION');
      const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY');
      const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');

      if (!region || !accessKeyId || !secretAccessKey) {
        this.logger.warn('Missing AWS credentials or region in .env');
        throw new Error('Missing AWS credentials or region in .env');
      }

      const sts = new STSClient({
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      })
    
      const command = new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: `auditforge-session-${Date.now()}`,
        ExternalId: externalId,
        DurationSeconds: 3600,
      });
    
      const result = await sts.send(command);
      if (!result.Credentials) throw new Error('Failed to assume role');
    
      return result.Credentials;
    }

    async discoverAwsAccounts(credentials: AwsCredentialIdentity): Promise<{ id: string, name: string, email: string }[]> {
      const region = this.configService.get<string>('AWS_REGION');

      try {
        const org = new OrganizationsClient({ region, credentials });
        const response = await org.send(new ListAccountsCommand());
    
        return (response.Accounts || []).map((acc) => ({
          id: acc.Id!,
          name: acc.Name!,
          email: acc.Email!,
        }));
      } catch (err: any) {
        if (err?.name === 'AWSOrganizationsNotInUseException') {
          // Fallback to current account identity
          const sts = new STSClient({ region, credentials });
          const identity = await sts.send(new GetCallerIdentityCommand());
    
          return [
            {
              id: identity.Account!,
              name: 'Root Account',
              email: '',
            },
          ];
        }
    
        throw err;
      }
    }

    async getAwsAccountIdFromCreds(
      creds: AwsCredentialIdentity,
      region = 'us-east-1'
    ): Promise<string> {
      const sts = new STSClient({ region, credentials: creds });
      const identity = await sts.send(new GetCallerIdentityCommand({}));
      return identity.Account!;
    }

    async useAWSSecretsManager(): Promise<boolean> {
      const region = this.configService.get<string>('AWS_REGION');
      const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY');
      const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
      const enableSecretManager = this.configService.get<string>('ENABLE_SECRETS_MANAGER')
  
      return Boolean(
        region &&
        accessKeyId &&
        secretAccessKey &&
        enableSecretManager === 'true'
      );
    }

    async createSecret(name: string, value: string): Promise<string> {
      try {
        const command = new CreateSecretCommand({
          Name: name,
          SecretString: value,
        });
  
        const response = await this.client.send(command);
        return response.ARN!;
      } catch (err) {
        this.logger.error(`Failed to create secret: ${name}`, err);
        throw err;
      }
    }

    async getSecretWithFallback(secretName: string, envKey: string, defaultValue?: string): Promise<string> {
      const useSecretManager = await this.useAWSSecretsManager();
      
      if (useSecretManager) {
        try {
          return await this.getSecretValue(secretName);
        } catch (error) {
          this.logger.warn(`Failed to get secret ${secretName} from AWS, falling back to env var ${envKey}`);
        }
      }
      
      const envValue = this.configService.get(envKey);
      if (!envValue && defaultValue) {
        return defaultValue;
      }
      if (!envValue) {
        throw new Error(`Secret not found: ${secretName} (env: ${envKey})`);
      }
      
      return envValue;
    }
    
    async getSecretValue(secretId: string): Promise<string> {
      try {
        const command = new GetSecretValueCommand({ SecretId: secretId });
        const response = await this.client.send(command);
        return response.SecretString!;
      } catch (err) {
        this.logger.error(`Failed to get secret: ${secretId}`, err);
        throw err;
      }
    }

    async updateSecret(name: string, value: string): Promise<void> {
        const command = new PutSecretValueCommand({
            SecretId: name,
            SecretString: value,
        });
        await this.client.send(command);
    }

    async deleteSecret(name: string): Promise<void> {
        const command = new DeleteSecretCommand({ SecretId: name });
        await this.client.send(command);
    }
}
