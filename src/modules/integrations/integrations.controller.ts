// modules/integrations/integrations.controller.ts
import { Controller, Post, Body, BadRequestException, UseGuards, Get, Param, NotFoundException, Query, Delete, Res, UseInterceptors, Req, UploadedFile, Logger, InternalServerErrorException } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import { GitHubAuthService } from '@/shared/services/github-auth.service';
import { GithubScanService } from './services/github-scan.service';
import { GCPScanService } from './services/gcp-scan.service';
import { AWSScanService } from './services/aws-scan.service';
import { User } from '@/common/decorators/user.decorator';
import { ConfigService } from '@nestjs/config';
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
    this.logger.log(`Starting integration creation for user ${userId}`, {
      type: dto.type,
      projectId: dto.projectId
    });

    try {
      const integration = await this.integrationsService.create(dto, Number(userId));
      this.logger.log(`Successfully created integration ${integration.id} for user ${userId}`);
      return integration;
    } catch (error) {
      this.logger.error(`Failed to create integration for user ${userId}`, error.stack);
      throw new InternalServerErrorException('Failed to create integration');
    }
  }

  @Get(':id')
  async getIntegration(@Param('id') id: string, @User() user) {
    this.logger.log(`Starting integration fetch for ID ${id} by user ${user.id}`);

    try {
      const integration = await this.integrationsService.getById(id, user);
      if (!integration) {
        this.logger.warn(`Integration ${id} not found for user ${user.id}`);
        throw new NotFoundException('Integration not found');
      }
      this.logger.log(`Successfully fetched integration ${id} for user ${user.id}`);
      return integration;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to fetch integration ${id} for user ${user.id}`, error.stack);
      throw new InternalServerErrorException('Failed to fetch integration');
    }
  }

  @Get('github/callback')
  async githubCallback(
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    this.logger.log(`Starting GitHub OAuth callback`, { state });

    try {
      const parsedState = validateOAuthState(state);
      const token = await this.githubAuthService.exchangeCodeForToken(code);

      const integration = await this.githubScanService.createOrUpdateGitHubIntegration(
        token,
        Number(parsedState.userId),
        parsedState.projectId,
      );

      this.logger.log(`Successfully created GitHub integration ${integration.id} for user ${parsedState.userId}`);
      return {
        message: 'GitHub integration created',
        integrationId: integration.id,
      };
    } catch (error) {
      this.logger.error('Failed to create GitHub integration', error.stack);
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
    this.logger.log(`Starting GitHub scan for project ${projectId} by user ${user.id}`, { repos });

    try {
      await this.githubScanService.scanGitHubIntegrationProjects(projectId, repos, user);
      this.logger.log(`Successfully triggered GitHub scan for project ${projectId} by user ${user.id}`);
      return { message: 'GitHub log scan triggered' };
    } catch (error) {
      this.logger.error(`Failed to trigger GitHub scan for project ${projectId} by user ${user.id}`, error.stack);
      throw new InternalServerErrorException('Failed to trigger GitHub scan');
    }
  }

  // AWS scan
  @Post('/aws/connect-role')
  async connectAWSViaRole(
    @Body() body: {
      assumeRoleArn: string;
      externalId?: string;
      region?: string;
      projectId: string;
    },
    @User() user,
  ) {
    this.logger.log(`Starting AWS role connection`, {
      projectId: body.projectId,
      userId: user.id,
      region: body.region
    });

    try {
      const result = await this.awsScanService.connectAWSRole({
        ...body,
        userId: user.id,
      });
      this.logger.log(`Successfully connected AWS role for project ${body.projectId}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to connect AWS role for project ${body.projectId}`, error.stack);
      throw new InternalServerErrorException('Failed to connect AWS role');
    }
  }

  @Get('projects/:id/scan-history')
  async getScanHistory(@Param('id') id: string, @User() user) {
    this.logger.log(`Starting scan history fetch for project ${id} by user ${user.id}`);

    try {
      const history = await this.integrationsService.getScanHistoryForProject(id, user);
      this.logger.log(`Successfully fetched scan history for project ${id} by user ${user.id}`);
      return history;
    } catch (error) {
      this.logger.error(`Failed to fetch scan history for project ${id} by user ${user.id}`, error.stack);
      throw new InternalServerErrorException('Failed to fetch scan history');
    }
  }

  @Post('/projects/:projectId/aws/scan')
  async scanAwsProjects(
    @Param('projectId') projectId: string,
    @User() user,
  ) {
    this.logger.log(`Starting AWS scan for project ${projectId} by user ${user.id}`);

    try {
      await this.awsScanService.scanAWSIntegrationProjects(projectId, user);
      this.logger.log(`Successfully triggered AWS scan for project ${projectId} by user ${user.id}`);
      return { message: 'AWS scan triggered' };
    } catch (error) {
      this.logger.error(`Failed to trigger AWS scan for project ${projectId} by user ${user.id}`, error.stack);
      throw new InternalServerErrorException('Failed to trigger AWS scan');
    }
  }

  // GitHub OAuth endpoints
  @Get('/github/auth-url')
  async getGitHubAuthUrl(
    @Query('projectId') projectId: string,
    @User('id') userId: string,
  ) {
    this.logger.log(`Starting GitHub auth URL generation for project ${projectId} by user ${userId}`);

    try {
      const authUrl = await this.githubScanService.generateAuthUrl(projectId, userId);
      this.logger.log(`Successfully generated GitHub auth URL for project ${projectId} by user ${userId}`);
      return authUrl;
    } catch (error) {
      this.logger.error(`Failed to generate GitHub auth URL for project ${projectId} by user ${userId}`, error.stack);
      throw new InternalServerErrorException('Failed to generate GitHub auth URL');
    }
  }

  @Get('/gcp/auth-url')
  async getGCPAuthUrl(
    @Query('projectId') projectId: string,
    @User('id') userId: string,
  ) {
    this.logger.log(`Starting GCP auth URL generation for project ${projectId} by user ${userId}`);

    try {
      const authUrl = await this.gcpScanService.generateAuthUrl(projectId, userId);
      this.logger.log(`Successfully generated GCP auth URL for project ${projectId} by user ${userId}`);
      return authUrl;
    } catch (error) {
      this.logger.error(`Failed to generate GCP auth URL for project ${projectId} by user ${userId}`, error.stack);
      throw new InternalServerErrorException('Failed to generate GCP auth URL');
    }
  }

  @Get('/gcp/callback')
  async gcpCallback(
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    this.logger.log(`Starting GCP OAuth callback`, { state });

    try {
      const parsedState = validateOAuthState(state);

      const integration = await this.gcpScanService.createOrUpdateGCPIntegrationOAuth({
        projectId: parsedState.projectId,
        userId: Number(parsedState.userId),
        authorizationCode: code,
        redirectUri: this.configService.get<string>('GCP_REDIRECT_URI') || 'http://localhost:3000/integrations/gcp/callback',
      });

      this.logger.log(`Successfully created GCP integration ${integration.id} for user ${parsedState.userId}`);
      return {
        message: 'GCP OAuth integration created successfully',
        integrationId: integration.id,
        projectId: parsedState.projectId,
        userId: parsedState.userId
      };
    } catch (error) {
      this.logger.error('Failed to create GCP integration', error.stack);
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
    this.logger.log(`Starting GCP OAuth connection`, {
      projectId: body.projectId,
      userId: body.userId
    });

    try {
      const integration = await this.gcpScanService.createOrUpdateGCPIntegrationOAuth({
        projectId: body.projectId,
        userId: body.userId,
        authorizationCode: body.authorizationCode,
        redirectUri: body.redirectUri,
      });
      this.logger.log(`Successfully connected GCP OAuth for project ${body.projectId}`);
      return integration;
    } catch (error) {
      this.logger.error(`Failed to connect GCP OAuth for project ${body.projectId}`, error.stack);
      throw new InternalServerErrorException('Failed to connect GCP OAuth');
    }
  }

  @Post('/projects/:projectId/gcp/scan')
  async scanGcpProjects(
    @Param('projectId') projectId: string,
    @Body('projects') selectedProjects: string[],
    @User() user,
  ) {
    this.logger.log(`Starting GCP scan for project ${projectId} by user ${user.id}`, { selectedProjects });

    try {
      await this.gcpScanService.scanGCPIntegrationProjects(projectId, selectedProjects, user);
      this.logger.log(`Successfully triggered GCP scan for project ${projectId} by user ${user.id}`);
      return { message: 'GCP scan started' };
    } catch (error) {
      this.logger.error(`Failed to trigger GCP scan for project ${projectId} by user ${user.id}`, error.stack);
      throw new InternalServerErrorException('Failed to trigger GCP scan');
    }
  }

  @Delete('/:id')
  async deleteIntegration(@Param('id') id: string, @User('id') userId: string) {
    this.logger.log(`Starting integration deletion for ID ${id} by user ${userId}`);

    try {
      await this.integrationsService.deleteIntegration(id, Number(userId));
      this.logger.log(`Successfully deleted integration ${id} by user ${userId}`);
      return { message: `Integration ${id} deleted` };
    } catch (error) {
      this.logger.error(`Failed to delete integration ${id} by user ${userId}`, error.stack);
      throw new InternalServerErrorException('Failed to delete integration');
    }
  }
}
