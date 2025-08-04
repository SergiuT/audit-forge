// src/shared/services/github-auth.service.ts
import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { RetryService } from './retry.service';
import { CircuitBreakerService } from './circuit-breaker.service';

@Injectable()
export class GitHubAuthService {
  constructor(
    private configService: ConfigService,
    private retryService: RetryService,
    private circuitBreakerService: CircuitBreakerService
  ) {}

  async exchangeCodeForToken(code: string): Promise<string> {
    return this.retryService.withRetry({
      execute: () => this.circuitBreakerService.execute(
        'github-oauth',
        async () => {
          const client_id = this.configService.get('GITHUB_CLIENT_ID');
          const client_secret = this.configService.get('GITHUB_CLIENT_SECRET');
  
          const response = await axios.post(
            'https://github.com/login/oauth/access_token',
            {
              client_id,
              client_secret,
              code,
            },
            {
              headers: { Accept: 'application/json' },
            },
          );
  
          if (response.data.error) {
            throw new Error(`GitHub OAuth failed: ${response.data.error_description}`);
          }
  
          return response.data.access_token;
        }
      ),
      serviceName: 'github-oauth',
      maxRetries: 3,
      retryDelay: (retryCount) => Math.min(1000 * Math.pow(2, retryCount), 10000),
    });
  }
}
