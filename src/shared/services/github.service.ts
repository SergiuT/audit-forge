// src/shared/services/github.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { Octokit } from '@octokit/rest';
import { RetryService } from './retry.service';
import { CircuitBreakerService } from './circuit-breaker.service';

@Injectable()
export class GitHubService {
  constructor(
    private retryService: RetryService,
    private circuitBreakerService: CircuitBreakerService,
  ) { }

  private getOctokit(token: string) {
    return new Octokit({ auth: token });
  }

  async getUserInfo(token: string) {
    return this.retryService.withRetry({
      execute: () => this.circuitBreakerService.execute(
        'github-user-info',
        async () => {
          const client = this.getOctokit(token);
          const { data } = await client.users.getAuthenticated();
          return data;
        }
      ),
      maxRetries: 3,
      retryDelay: (retryCount) => Math.min(1000 * Math.pow(2, retryCount), 10000),
    });
  }

  async listUserRepos(token: string) {
    return this.retryService.withRetry({
      execute: () => this.circuitBreakerService.execute(
        'github-list-repos',
        async () => {
          const client = this.getOctokit(token);
          return await client.paginate('GET /user/repos', {
            per_page: 100,
          });
        }
      ),
      maxRetries: 3,
      retryDelay: (retryCount) => Math.min(1000 * Math.pow(2, retryCount), 10000),
    });
  }

  async listOrgRepos(token: string, org: string) {
    return this.retryService.withRetry({
      execute: () => this.circuitBreakerService.execute(
        'github-org-repos',
        async () => {
          const client = this.getOctokit(token);
          return await client.paginate('GET /orgs/{org}/repos', {
            org,
            per_page: 100,
          });
        }
      ),
      maxRetries: 3,
      retryDelay: (retryCount) => Math.min(1000 * Math.pow(2, retryCount), 10000),
    });
  }

  async getWorkflowRuns(token: string, owner: string, repo: string) {
    return this.retryService.withRetry({
      execute: () => this.circuitBreakerService.execute(
        'github-workflow-runs',
        async () => {
          const client = this.getOctokit(token);
          const { data } = await client.actions.listWorkflowRunsForRepo({
            owner,
            repo,
            per_page: 5, // adjust for your scan window
          });
          return data.workflow_runs;
        }
      ),
      maxRetries: 3,
      retryDelay: (retryCount) => Math.min(1000 * Math.pow(2, retryCount), 10000),
    });
  }

  async listOrgs(token: string) {
    return this.retryService.withRetry({
      execute: () => this.circuitBreakerService.execute(
        'github-list-orgs',
        async () => {
          const client = this.getOctokit(token);
          const { data } = await client.orgs.listForAuthenticatedUser();
          return data;
        }
      ),
      maxRetries: 3,
      retryDelay: (retryCount) => Math.min(1000 * Math.pow(2, retryCount), 10000),
    });
  }
}
