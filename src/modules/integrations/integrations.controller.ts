// modules/integrations/integrations.controller.ts
import { Controller, Post, Body, BadRequestException, UseGuards, Get, Param, NotFoundException, Query, Delete, Res, UseInterceptors, Req, UploadedFile } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import { GitHubAuthService } from '@/shared/services/github-auth.service';
import { GithubScanService } from './services/github-scan.service';
import { GCPScanService } from './services/gcp-scan.service';
import { AWSScanService } from './services/aws-scan.service';
import { User } from '@/common/decorators/user.decorator';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { validateOAuthState } from '@/shared/utils/oauth-state.util';

@Controller('integrations')
export class IntegrationsController {
  private readonly logger = new Logger(IntegrationsController.name);

  constructor(
    private githubAuthService: GitHubAuthService,
    private readonly integrationsService: IntegrationsService,
    private readonly githubScanService: GithubScanService,
    private readonly gcpScanService: GCPScanService,
    private readonly awsScanService: AWSScanService,
    private readonly configService: ConfigService,
  ) { }

  @Post()
  async createIntegration(@Body() dto: CreateIntegrationDto, @User('id') userId: string) {
    return this.integrationsService.create(dto, Number(userId));
  }

  @Get(':id')
  async getIntegration(@Param('id') id: string, @User() user) {
    const integration = await this.integrationsService.getById(id, user);
    if (!integration) throw new NotFoundException('Integration not found');
    return integration;
  }

  @Get('github/callback')
  async githubCallback(
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    try {
      const parsedState = validateOAuthState(state);
      const token = await this.githubAuthService.exchangeCodeForToken(code);

      const integration = await this.githubScanService.createOrUpdateGitHubIntegration(
        token,
        Number(parsedState.userId),
        parsedState.projectId,
      );

      return {
        message: 'GitHub integration created',
        integrationId: integration.id,
      };
    } catch (error) {
      this.logger.error('Failed to create GitHub integration', error);
      throw new BadRequestException(`Failed to create GitHub integration: ${error.message}`);
    }
  }

  // Github scan
  @Post('/projects/:projectId/github/scan')
  async scanGithubLogs(
    @Param('projectId') projectId: string,
    @Body('repos') repos: string[],
    @User() user,
  ) {
    await this.githubScanService.scanGitHubIntegrationProjects(projectId, repos, user);
    return { message: 'GitHub log scan triggered' };
  }

  // AWS scan
  @Post('/aws/connect-role')
  async connectAWSViaRole(
    @Body() body: {
      assumeRoleArn: string;
      externalId?: string;
      region?: string;
      projectId: string;
      userId: number;
    },
  ) {
    return this.awsScanService.connectAWSRole({
      ...body,
    });
  }

  @Get('projects/:id/scan-history')
  async getScanHistory(@Param('id') id: string, @User() user) {
    return this.integrationsService.getScanHistoryForProject(id, user);
  }

  @Post('/projects/:projectId/aws/scan')
  async scanAwsProjects(
    @Param('projectId') projectId: string,
    @User() user,
  ) {
    await this.awsScanService.scanAWSIntegrationProjects(projectId, user);
    return { message: 'AWS scan triggered' };
  }

  // GitHub OAuth endpoints
  @Get('/github/auth-url')
  async getGitHubAuthUrl(
    @Query('projectId') projectId: string,
    @User('id') userId: string,
  ) {
    return this.githubScanService.generateAuthUrl(projectId, userId);
  }

  @Get('/gcp/auth-url')
  async getGCPAuthUrl(
    @Query('projectId') projectId: string,
    @User('id') userId: string,
  ) {
    return this.gcpScanService.generateAuthUrl(projectId, userId);
  }

  @Get('/gcp/callback')
  async gcpCallback(
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    try {
      const parsedState = validateOAuthState(state);

      const integration = await this.gcpScanService.createOrUpdateGCPIntegrationOAuth({
        projectId: parsedState.projectId,
        userId: Number(parsedState.userId),
        authorizationCode: code,
        redirectUri: this.configService.get<string>('GCP_REDIRECT_URI') || 'http://localhost:3000/integrations/gcp/callback',
      });

      return {
        message: 'GCP OAuth integration created successfully',
        integrationId: integration.id,
        projectId: parsedState.projectId,
        userId: parsedState.userId
      };
    } catch (error) {
      this.logger.error('Failed to create GCP integration', error);
      throw new BadRequestException(`Failed to create GCP integration: ${error.message}`);
    }
  }

  @Post('/gcp/connect-oauth')
  async connectGCPOAuth(
    @Body() body: {
      projectId: string,
      userId: number,
      authorizationCode: string,
      redirectUri: string
    },
  ) {
    return this.gcpScanService.createOrUpdateGCPIntegrationOAuth({
      projectId: body.projectId,
      userId: body.userId,
      authorizationCode: body.authorizationCode,
      redirectUri: body.redirectUri,
    });
  }

  @Post('/projects/:projectId/gcp/scan')
  async scanGcpProjects(
    @Param('projectId') projectId: string,
    @Body('projects') selectedProjects: string[],
    @User() user,
  ) {
    await this.gcpScanService.scanGCPIntegrationProjects(projectId, selectedProjects, user);
    return { message: 'GCP scan started' };
  }

  @Delete('/:id')
  async deleteIntegration(@Param('id') id: string, @User('id') userId: string) {
    await this.integrationsService.deleteIntegration(id, Number(userId));
    return { message: `Integration ${id} deleted` };
  }
}
