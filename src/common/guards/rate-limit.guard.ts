import { RateLimiterService } from "@/shared/services/rate-limiter.service";
import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { RATE_LIMIT_CONFIG } from "@/config/rate-limit.config";
import { Reflector } from "@nestjs/core";
import { RATE_LIMIT_KEY, RateLimitOptions } from "../decorators/rate-limit.decorator";

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private rateLimiterService: RateLimiterService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    
    const decoratorConfig = this.reflector.get<RateLimitOptions>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );
    
    const route = this.getRoutePath(request);
    const config = decoratorConfig || RATE_LIMIT_CONFIG.endpoints[route] || RATE_LIMIT_CONFIG.global;
    
    if (!config) {
      return true;
    }
    
    let key: string;

    try {

      switch (config.type) {
        case 'user':
          const user = request.user;
          if (!user) {
            throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
          }
          key = await this.rateLimiterService.getUserKey(user.id, request.route.path);
          break;
          
        case 'ip':
          key = await this.rateLimiterService.getIPKey(request.ip, request.route.path);
          break;
          
        case 'global':
          key = await this.rateLimiterService.getGlobalKey(request.route.path);
          break;
          
        default:
          return true;
      }
    
      const result = await this.rateLimiterService.checkRateLimit(key, config);
    
      // Set rate limit headers
      response.set('X-RateLimit-Limit', result.limit.toString());
      response.set('X-RateLimit-Remaining', result.remaining.toString());
      response.set('X-RateLimit-Reset', new Date(result.reset).toISOString());
  
      if (result.remaining === 0) {
        response.set('Retry-After', result.retryAfter?.toString() || '60');
        throw new HttpException(
          {
            message: 'Too many requests',
            retryAfter: result.retryAfter,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
  
      return true;
    } catch (error) {
      if (error.message.includes('Redis')) {
        console.warn('Rate limiting unavailable:', error.message);
        return true;
      }
      throw error;
    }
  }

  private getRoutePath(request: any): string {
    return request.route?.path || request.path || request.url;
  }
}