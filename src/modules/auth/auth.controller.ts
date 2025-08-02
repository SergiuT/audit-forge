// src/modules/auth/auth.controller.ts
import { Controller, Post, Body, UseGuards, Req, Get, Param, Logger, BadRequestException, UnauthorizedException, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthenticatedRequest } from '@/shared/types/types';
import { LoginDto, RegisterDto, RefreshTokenDto } from './dto/auth.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) { }

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  async register(
    @Body() registerDto: RegisterDto,
    @Req() request: Request,
  ) {
    this.logger.log(`Starting user registration for email ${registerDto.email}`);

    try {
      const result = await this.authService.register(
        registerDto.username,
        registerDto.email,
        registerDto.password,
        request,
      );
      this.logger.log(`Successfully registered user ${registerDto.email}`);
      return result;
    } catch (error) {
      if (error instanceof ConflictException) {
        this.logger.warn(`Registration conflict for email ${registerDto.email}: ${error.message}`);
        throw error;
      }
      this.logger.error(`Failed to register user ${registerDto.email}`, error.stack);
      throw new InternalServerErrorException('Failed to register user');
    }
  }

  @Post('login')
  @ApiOperation({ summary: 'Login user' })
  async login(
    @Body() loginDto: LoginDto,
    @Req() request: Request,
  ) {
    this.logger.log(`Starting user login for email ${loginDto.email}`);

    try {
      const result = await this.authService.login(
        loginDto.email,
        loginDto.password,
        request,
      );
      this.logger.log(`Successfully logged in user ${loginDto.email}`);
      return result;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        this.logger.warn(`Login failed for email ${loginDto.email}: Invalid credentials`);
        throw error;
      }
      this.logger.error(`Failed to login user ${loginDto.email}`, error.stack);
      throw new InternalServerErrorException('Failed to login user');
    }
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  async refreshToken(
    @Body() refreshDto: RefreshTokenDto,
    @Req() request: Request,
  ) {
    this.logger.log(`Starting token refresh`);

    try {
      const result = await this.authService.refreshToken(
        refreshDto.refreshToken,
        request,
      );
      this.logger.log(`Successfully refreshed token`);
      return result;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        this.logger.warn(`Token refresh failed: Invalid refresh token`);
        throw error;
      }
      this.logger.error(`Failed to refresh token`, error.stack);
      throw new InternalServerErrorException('Failed to refresh token');
    }
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout user' })
  async logout(
    @Body() refreshDto: RefreshTokenDto,
    @Req() request: AuthenticatedRequest,
  ) {
    this.logger.log(`Starting user logout for user ${request.user?.id}`);

    try {
      const result = await this.authService.logout(refreshDto.refreshToken, request.user?.id);
      this.logger.log(`Successfully logged out user ${request.user?.id}`);
      return result;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        this.logger.warn(`Logout failed for user ${request.user?.id}: Invalid refresh token`);
        throw error;
      }
      this.logger.error(`Failed to logout user ${request.user?.id}`, error.stack);
      throw new InternalServerErrorException('Failed to logout user');
    }
  }

  @Post('logout-all')
  @ApiOperation({ summary: 'Logout from all devices' })
  @ApiResponse({ status: 200, description: 'Logout from all devices successful' })
  async logoutAll(@Req() request: AuthenticatedRequest) {
    this.logger.log(`Starting logout from all devices for user ${request.user?.id}`);

    try {
      const result = await this.authService.logoutAll(request.user?.id);
      this.logger.log(`Successfully logged out user ${request.user?.id} from all devices`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to logout user ${request.user?.id} from all devices`, error.stack);
      throw new InternalServerErrorException('Failed to logout from all devices');
    }
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Get user sessions' })
  @ApiResponse({ status: 200, description: 'User sessions retrieved' })
  async getUserSessions(@Req() request: AuthenticatedRequest) {
    this.logger.log(`Starting user sessions fetch for user ${request.user?.id}`);

    try {
      const sessions = await this.authService.getUserSessions(request.user?.id);
      this.logger.log(`Successfully fetched sessions for user ${request.user?.id}`);
      return sessions;
    } catch (error) {
      this.logger.error(`Failed to fetch sessions for user ${request.user?.id}`, error.stack);
      throw new InternalServerErrorException('Failed to fetch user sessions');
    }
  }
}
