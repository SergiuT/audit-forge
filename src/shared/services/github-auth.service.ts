// src/shared/services/github-auth.service.ts
import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GitHubAuthService {
  constructor(private configService: ConfigService) {}

  async exchangeCodeForToken(code: string): Promise<string> {
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
}
