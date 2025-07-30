import { Injectable } from '@nestjs/common';
import { ProjectsClient } from '@google-cloud/resource-manager';
import { GoogleAuth } from 'google-auth-library';

@Injectable()
export class GCPService {
  async getProjects(credentialsJson: string): Promise<any[]> {
    const credentials = JSON.parse(credentialsJson);

    const client = new ProjectsClient({
        credentials,
    });

    const [projects] = await client.searchProjects({});
    return projects.map((p) => ({
      projectId: p.projectId,
      name: p?.displayName || p.name,
      number: p.name?.split('/')[1] ?? null,
      state: p.state,
      labels: p.labels,
    }));
  }
}
