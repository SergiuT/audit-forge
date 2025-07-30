// src/shared/services/github.service.ts
import { Injectable } from '@nestjs/common';
import { Octokit } from '@octokit/rest';

@Injectable()
export class GitHubService {
  private getOctokit(token: string) {
    return new Octokit({ auth: token });
  }

  async getUserInfo(token: string) {
    const client = this.getOctokit(token);
    const { data } = await client.users.getAuthenticated();
    return data;
  }

  async listUserRepos(token: string) {
    const client = this.getOctokit(token);
    return await client.paginate('GET /user/repos', {
      per_page: 100,
    });
  }

  async listOrgRepos(token: string, org: string) {
    const client = this.getOctokit(token);
    return await client.paginate('GET /orgs/{org}/repos', {
      org,
      per_page: 100,
    });
  }

  async getWorkflowRuns(token: string, owner: string, repo: string) {
    const client = this.getOctokit(token);
    const { data } = await client.actions.listWorkflowRunsForRepo({
      owner,
      repo,
      per_page: 5, // adjust for your scan window
    });
    return data.workflow_runs;
  }

  async listOrgs(token: string) {
    const client = this.getOctokit(token);
    const { data } = await client.orgs.listForAuthenticatedUser();
    return data;
  }
}
