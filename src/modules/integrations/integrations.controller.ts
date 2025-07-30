// modules/integrations/integrations.controller.ts
import { Controller, Post, Body, BadRequestException, UseGuards, Get, Param, NotFoundException, Query, Delete, Res, UseInterceptors, Req, UploadedFile } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import { GitHubAuthService } from '@/shared/services/github-auth.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { GithubScanService } from './services/github-scan.service';
import { GCPScanService } from './services/gcp-scan.service';
import { AWSScanService } from './services/aws-scan.service';
import { User } from '@/common/decorators/user.decorator';

// @UseGuards(JwtAuthGuard)
@Controller('integrations')
export class IntegrationsController {
  constructor(
    private githubAuthService: GitHubAuthService,
    private readonly integrationsService: IntegrationsService,
    private readonly githubScanService: GithubScanService,
    private readonly gcpScanService: GCPScanService,
    private readonly awsScanService: AWSScanService,
  ) { }

  @Post()
  async createIntegration(@Body() dto: CreateIntegrationDto) {
    return this.integrationsService.create(dto);
  }

  @Get(':id')
  async getIntegration(@Param('id') id: string) {
    const integration = await this.integrationsService.getById(id);
    if (!integration) throw new NotFoundException('Integration not found');
    return integration;
  }

  @Get('github/callback')
  async githubCallback(
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    const token = await this.githubAuthService.exchangeCodeForToken(code);

    let parsedState: { userId: string; projectId: string };
    try {
      parsedState = JSON.parse(decodeURIComponent(state));
    } catch (err) {
      throw new BadRequestException('Invalid state parameter');
    }

    const integration = await this.githubScanService.createOrUpdateGitHubIntegration(
      token,
      parsedState.userId,
      parsedState.projectId,
    );

    return {
      message: 'GitHub integration created',
      integrationId: integration.id,
    };
  }

  @Post('/projects/:projectId/github/scan')
  async scanGithubLogs(
    @Param('projectId') projectId: string,
    @Body('repos') repos: string[],
    @User('id') userId: string,
  ) {
    await this.githubScanService.scanGitHubIntegrationProjects(projectId, repos, userId);
    return { message: 'GitHub log scan triggered' };
  }

  @Post('/aws/connect-role')
  async connectAWSViaRole(
    @Body() body: {
      assumeRoleArn: string;
      externalId?: string;
      region?: string;
      projectId: string;
      userId: string;
    },
  ) {
    return this.awsScanService.connectAWSRole({
      ...body,
    });
  }

  @Get('projects/:id/scan-history')
  async getScanHistory(@Param('id') id: string) {
    return this.integrationsService.getScanHistoryForProject(id);
  }

  @Post('/projects/:projectId/aws/scan')
  async scanAwsProjects(
    @Param('projectId') projectId: string,
  ) {
    await this.awsScanService.scanAWSIntegrationProjects(projectId);
    return { message: 'AWS scan triggered' };
  }

  @Post('/gcp/connect')
  @UseInterceptors(FileInterceptor('file')) // handles file upload
  async connectGCP(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { projectId: string, userId: string },
  ) {
    return this.gcpScanService.createOrUpdateGCPIntegration({
      file,
      projectId: body.projectId,
      userId: body.userId,
    });
  }

  @Post('/projects/:projectId/gcp/scan')
  async scanGcpProjects(
    @Param('projectId') projectId: string,
    @Body('projects') selectedProjects: string[],
  ) {
    await this.gcpScanService.scanGCPIntegrationProjects(projectId, selectedProjects);
    return { message: 'GCP scan started' };
  }

  @Delete('/:id')
  @UseGuards(JwtAuthGuard) // or RBAC if needed
  async deleteIntegration(@Param('id') id: string) {
    await this.integrationsService.deleteIntegration(id);
    return { message: `Integration ${id} deleted` };
  }

  // @Post('github/logs')
  // async ingestLogs(
  //   @Body() body: { token: string; owner: string; repo: string; runId: number, projectId: number },
  // ) {
  //   const { token, owner, repo, runId, projectId } = body;
  //   if (!token || !owner || !repo || !runId || !projectId) {
  //     throw new BadRequestException('Missing required fields');
  //   }
  //   return this.integrationsService.processGitHubLogs({
  //     token,
  //     owner,
  //     repo,
  //     runId,
  //     projectId
  //   });
  // }

  // @Post('gcp/logs')
  // async fetchGcpLogs(
  //   @Body() body: { gcpProjectId: string; filter: string; projectId: number; userId?: number },
  // ) {
  //   return this.integrationsService.processGcpLogs(body);
  // }

  // @Post('aws/logs')
  // async ingestAwsLogs(@Body() body: { prefix: string, projectId: number; userId?: number }) {
  //   const logs = await this.integrationsService.processAwsLogs(body);

  //   return { message: 'AWS logs processed', logs };
  // }
}
