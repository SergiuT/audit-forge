// src/modules/auth/auth.controller.ts
import { Controller, Post, Body, UseGuards, Req, Get, Param } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthenticatedRequest } from '@/shared/types/types';
import { LoginDto, RegisterDto, RefreshTokenDto } from './dto/auth.dto';
import { RateLimitGuard } from '@/common/guards/rate-limit.guard';
import { RateLimit } from '@/common/decorators/rate-limit.decorator';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  async register(
    @Body() registerDto: RegisterDto,
    @Req() request: Request,
  ) {
    return this.authService.register(
      registerDto.username,
      registerDto.email,
      registerDto.password,
      request,
    );
  }

  @Post('login')
  // @UseGuards(RateLimitGuard)
  // @RateLimit({
  //   windowMs: 15 * 60 * 1000,
  //   maxRequests: 5,
  //   type: 'user'
  // })
  @ApiOperation({ summary: 'Login user' })
  async login(
    @Body() loginDto: LoginDto,
    @Req() request: Request,
  ) {
    return this.authService.login(
      loginDto.email,
      loginDto.password,
      request,
    );
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  async refreshToken(
    @Body() refreshDto: RefreshTokenDto,
    @Req() request: Request,
  ) {
    return this.authService.refreshToken(
      refreshDto.refreshToken,
      request,
    );
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout user' })
  async logout(
    @Body() refreshDto: RefreshTokenDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.authService.logout(refreshDto.refreshToken, request.user?.id);
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout from all devices' })
  @ApiResponse({ status: 200, description: 'Logout from all devices successful' })
  async logoutAll(@Req() request: AuthenticatedRequest) {
    return this.authService.logoutAll(request.user?.id);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user sessions' })
  @ApiResponse({ status: 200, description: 'User sessions retrieved' })
  async getUserSessions(@Req() request: AuthenticatedRequest) {
    return this.authService.getUserSessions(request.user?.id);
  }
}
