import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rate_limit';

export interface RateLimitOptions {
    windowMs: number;
    maxRequests: number;
    type: 'user' | 'ip' | 'global';
    skipSuccessfulRequests?: boolean;
    skipFailedRequests?: boolean;
}
  
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);