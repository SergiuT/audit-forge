import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { JwtService } from '@/modules/auth/services/jwt.service';
import { RateLimiterService } from '@/shared/services/rate-limiter.service';
import { AuthService } from '@/modules/auth/auth.service';
import { SECURITY_CONFIG, SecurityPolicy } from '@/config/security.config';
import { UserRole } from '@/modules/auth/entities/user.entity';

@Injectable()
export class SecurityGuard implements CanActivate {
  private readonly logger = new Logger(SecurityGuard.name);
  constructor(
    private jwtService: JwtService,
    private rateLimiterService: RateLimiterService,
    private authService: AuthService,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const route = this.getRoutePath(request);

    this.logger.log(`🔍 SecurityGuard checking route: ${route}`);
    // Get security policy for this route
    const policy = this.getSecurityPolicy(route);

    if (!policy) {
      // Default to secure if no policy found
      this.logger.warn(`No security policy found for route: ${route}, defaulting to secure`);
      return this.requireAuth(context);
    }

    // Step 1: Handle Authentication
    if (policy.auth) {
      const authResult = await this.authenticateUser(request);
      if (!authResult.success) {
        throw new UnauthorizedException(authResult.error);
      }

      // Check roles if specified
      if (policy.roles && !policy.roles.includes(request.user.role)) {
        throw new ForbiddenException('Insufficient permissions');
      }
    }

    // Step 2: Handle Rate Limiting
    if (policy.rateLimit) {
      const rateLimitResult = await this.checkRateLimit(request, policy.rateLimit);
      if (!rateLimitResult.success) {
        throw new HttpException(
          {
            message: 'Too many requests',
            retryAfter: rateLimitResult.retryAfter,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Set rate limit headers
      response.set('X-RateLimit-Limit', rateLimitResult.limit.toString());
      response.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
      response.set('X-RateLimit-Reset', new Date(rateLimitResult.reset).toISOString());
    }

    // Handle multi tenant access
    if (policy.requireProjectAccess) {
      const projectAccessResult = await this.checkProjectAccess(request);
      if (!projectAccessResult.success) {
        throw new ForbiddenException(projectAccessResult.error);
      }
    }

    return true;
  }

  private async authenticateUser(request: any): Promise<{ success: boolean; error?: string }> {
    try {
      const token = this.extractToken(request);
      if (!token) {
        return { success: false, error: 'No token provided' };
      }

      const payload = await this.jwtService.validateAccessToken(token);
      if (payload.type !== 'access') {
        return { success: false, error: 'Invalid token type' };
      }

      // Get user from database
      const user = await this.authService.findUserWithProjects(payload.sub);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      this.logger.log(`🔍 User found: ${JSON.stringify(user)}`);
      // Set user in request (same as your current JwtAuthGuard)
      request.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        projects: user.projects,
      };

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Invalid token' };
    }
  }

  private async checkRateLimit(request: any, config: any): Promise<{
    success: boolean;
    limit: number;
    remaining: number;
    reset: number;
    retryAfter?: number;
  }> {
    let key: string;

    if (config.type === 'user') {
      if (!request.user) {
        // Fall back to IP-based rate limiting (same as your current fix)
        this.logger.log('No authenticated user found, falling back to IP-based rate limiting');
        key = await this.rateLimiterService.getIPKey(request.ip, request.route.path);
      } else {
        key = await this.rateLimiterService.getUserKey(request.user.id, request.route.path);
      }
    } else if (config.type === 'ip') {
      key = await this.rateLimiterService.getIPKey(request.ip, request.route.path);
    } else {
      key = await this.rateLimiterService.getGlobalKey(request.route.path);
    }

    const result = await this.rateLimiterService.checkRateLimit(key, config);
    return {
      success: result.remaining > 0,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
      retryAfter: result.retryAfter
    };
  }

  private async checkProjectAccess(request: any): Promise<{ success: boolean; error?: string }> {
    try {
      const user = request.user;
      if (!user) {
        return { success: false, error: 'User not authenticated' };
      }

      this.logger.log(`Checking project access for user: ${JSON.stringify(user)}`);

      // Extract projectId from params or body
      const projectId = parseInt(request.params.projectId || request.body.projectId);

      if (!projectId) {
        return { success: false, error: 'Project ID not found in request' };
      }

      // Admins can access everything
      if (user.role === UserRole.ADMIN) {
        this.logger.log(`Admin access granted for project ${projectId}`);
        return { success: true };
      }

      // Check if user has access to this project
      const hasAccess = user.projects?.some(p => p.id === projectId);

      if (!hasAccess) {
        this.logger.warn(`User ${user.id} denied access to project ${projectId}`);
        return { success: false, error: 'Access denied to this project' };
      }

      this.logger.log(`User ${user.id} granted access to project ${projectId}`);
      return { success: true };

    } catch (error) {
      this.logger.error(`Project access check failed: ${error.message}`);
      return { success: false, error: 'Project access verification failed' };
    }
  }

  private getSecurityPolicy(route: string): SecurityPolicy | null {
    // Find exact match first
    if (SECURITY_CONFIG[route]) {
      return SECURITY_CONFIG[route];
    }

    // Then try pattern matching for dynamic routes
    for (const [pattern, policy] of Object.entries(SECURITY_CONFIG)) {
      if (this.matchesPattern(route, pattern)) {
        return policy;
      }
    }

    return null;
  }

  private matchesPattern(route: string, pattern: string): boolean {
    // Simple pattern matching for :id, :projectId, etc.
    const routeParts = route.split('/');
    const patternParts = pattern.split('/');

    if (routeParts.length !== patternParts.length) {
      return false;
    }

    for (let i = 0; i < routeParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        // Dynamic parameter, always match
        continue;
      }
      if (routeParts[i] !== patternParts[i]) {
        return false;
      }
    }

    return true;
  }

  private extractToken(request: any): string | null {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }

  private getRoutePath(request: any): string {
    return request.route?.path || request.path || request.url;
  }

  private requireAuth(context: ExecutionContext): boolean {
    throw new UnauthorizedException('Authentication required');
  }
}