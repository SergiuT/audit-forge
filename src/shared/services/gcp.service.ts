import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { RetryService } from './retry.service';
import { decodeGcpAuditLogs } from '../utils/decode-gcp-logs.util';
import { Logging } from '@google-cloud/logging';

@Injectable()
export class GCPService {
  private readonly logger = new Logger(GCPService.name);

  constructor(
    private retryService: RetryService,
  ) {}

  async getProjects(credentialsJson: string): Promise<any[]> {
    const credentials = JSON.parse(credentialsJson);

    return this.retryService.withRetry({
      execute: async () => {
        try {
          const response = await axios.get(
            'https://cloudresourcemanager.googleapis.com/v1/projects',
            {
              headers: {
                Authorization: `Bearer ${credentials.access_token}`,
              },
            }
          );
          this.logger.log('GCP Service: Successfully fetched projects', {
            service: 'gcp-get-projects',
            projectCount: response.data.projects?.length || 0
          });

          const mappedProjects = response.data.projects.map((p) => ({
            projectId: p.projectId,
            name: p?.displayName || p.name,
            number: p.name?.split('/')[1] ?? null,
            state: p.state,
            labels: p.labels,
          }));

          return mappedProjects;
        } catch (error) {
          this.logger.error('GCP Service: Error fetching projects', {
            service: 'gcp-get-projects',
            error: error.message,
            status: error.response?.status,
            gcpErrorCode: error.response?.data?.error?.code
          });
          
          return [];
        }
      },
      serviceName: 'gcp-get-projects',
      maxRetries: 3,
      retryDelay: (retryCount) => Math.min(1000 * Math.pow(2, retryCount), 10000),
    });
  }

  async fetchLogsFromGCP(
    gcpProjectId: string,
    limit = 50,
    credentialsJson: string
  ): Promise<string> {
    const creds = JSON.parse(credentialsJson);
    const logging = new Logging({
      projectId: gcpProjectId,
      credentials: creds,
    });

    return this.retryService.withRetry({
      execute: async () => {
        try {
          const [entries]: any = await logging.getEntries({
            filter: `
              logName="projects/${gcpProjectId}/logs/cloudaudit.googleapis.com%2Factivity"
              timestamp >= "${new Date(Date.now() - 1000 * 60 * 60).toISOString()}"
            `,
            pageSize: limit,
            orderBy: 'timestamp desc',
          });
          const decodedLogs = await decodeGcpAuditLogs(entries);

          return decodedLogs.join('\n\n');
        } catch (err) {
          this.logger.error('Failed to fetch logs from GCP', err);
          throw err;
        }
      },
      serviceName: 'gcp-fetch-logs',
      maxRetries: 3,
      retryDelay: (retryCount) => Math.min(1000 * Math.pow(2, retryCount), 10000),
    });
  }
}
