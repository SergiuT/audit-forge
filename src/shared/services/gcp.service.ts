import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { RetryService } from './retry.service';
import { CircuitBreakerService } from './circuit-breaker.service';

@Injectable()
export class GCPService {
  private readonly logger = new Logger(GCPService.name);

  constructor(
    private retryService: RetryService,
    private circuitBreakerService: CircuitBreakerService
  ) {}

  async getProjects(credentialsJson: string): Promise<any[]> {
    const credentials = JSON.parse(credentialsJson);

    return this.retryService.withRetry({
      execute: () => this.circuitBreakerService.execute(
        'gcp-get-projects',
        async () => {
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
        }
      ),
      serviceName: 'gcp-get-projects',
      maxRetries: 3,
      retryDelay: (retryCount) => Math.min(1000 * Math.pow(2, retryCount), 10000),
    });
  }

  async validateCredentials(credentialsJson: string): Promise<boolean> {
    return this.retryService.withRetry({
      execute: () => this.circuitBreakerService.execute(
        'gcp-validate-credentials',
        async () => {
          try {
            await this.getProjects(credentialsJson);
            return true;
          } catch (error) {
            this.logger.error('GCP Service: Error validating credentials', {
              service: 'gcp-validate-credentials',
              error: error.message,
              status: error.response?.status,
              gcpErrorCode: error.response?.data?.error?.code
            });
            return false;
          }
        }
      ),
      serviceName: 'gcp-validate-credentials',
      maxRetries: 3,
      retryDelay: (retryCount) => Math.min(1000 * Math.pow(2, retryCount), 10000),
    });
  }
}
