// modules/integrations/integrations.controller.ts
import { Controller, Post, Body, BadRequestException, UseGuards, Get, Param, NotFoundException, Query, Delete, Res, UseInterceptors, Req, UploadedFile } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import { GitHubAuthService } from '@/shared/services/github-auth.service';
import { GithubScanService } from './services/github-scan.service';
import { GCPScanService } from './services/gcp-scan.service';
import { AWSScanService } from './services/aws-scan.service';
import { User } from '@/common/decorators/user.decorator';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
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
  @UseGuards(JwtAuthGuard)
  async createIntegration(@Body() dto: CreateIntegrationDto) {
    return this.integrationsService.create(dto);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getIntegration(@Param('id') id: string) {
    const integration = await this.integrationsService.getById(id);
    if (!integration) throw new NotFoundException('Integration not found');
    return integration;
  }

  @Get('github/callback')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute
  async githubCallback(
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    try {
      const parsedState = validateOAuthState(state);
      const token = await this.githubAuthService.exchangeCodeForToken(code);

      const integration = await this.githubScanService.createOrUpdateGitHubIntegration(
        token,
        parsedState.userId,
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
  @UseGuards(JwtAuthGuard)
  async scanGithubLogs(
    @Param('projectId') projectId: string,
    @Body('repos') repos: string[],
    @User('id') userId: string,
  ) {
    await this.githubScanService.scanGitHubIntegrationProjects(projectId, repos, userId);
    return { message: 'GitHub log scan triggered' };
  }

  // AWS scan
  @Post('/aws/connect-role')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  async getScanHistory(@Param('id') id: string) {
    return this.integrationsService.getScanHistoryForProject(id);
  }

  @Post('/projects/:projectId/aws/scan')
  @UseGuards(JwtAuthGuard)
  async scanAwsProjects(
    @Param('projectId') projectId: string,
  ) {
    await this.awsScanService.scanAWSIntegrationProjects(projectId);
    return { message: 'AWS scan triggered' };
  }

  // GitHub OAuth endpoints
  @Get('/github/auth-url')
  @UseGuards(JwtAuthGuard)
  async getGitHubAuthUrl(
    @Query('projectId') projectId: string,
    @User('id') userId: string,
  ) {
    return this.githubScanService.generateAuthUrl(projectId, userId);
  }

  @Get('/gcp/auth-url')
  @UseGuards(JwtAuthGuard)
  async getGCPAuthUrl(
    @Query('projectId') projectId: string,
    @User('id') userId: string,
  ) {
    return this.gcpScanService.generateAuthUrl(projectId, userId);
  }

  @Get('/gcp/callback')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute
  async gcpCallback(
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    try {
      const parsedState = validateOAuthState(state);

      const integration = await this.gcpScanService.createOrUpdateGCPIntegrationOAuth({
        projectId: parsedState.projectId,
        userId: parsedState.userId,
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
  @UseGuards(JwtAuthGuard)
  async connectGCPOAuth(
    @Body() body: {
      projectId: string,
      userId: string,
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
  @UseGuards(JwtAuthGuard)
  async scanGcpProjects(
    @Param('projectId') projectId: string,
    @Body('projects') selectedProjects: string[],
  ) {
    await this.gcpScanService.scanGCPIntegrationProjects(projectId, selectedProjects);
    return { message: 'GCP scan started' };
  }

  @Delete('/:id')
  @UseGuards(JwtAuthGuard)
  async deleteIntegration(@Param('id') id: string) {
    await this.integrationsService.deleteIntegration(id);
    return { message: `Integration ${id} deleted` };
  }
}
