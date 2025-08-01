import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { SecurityGuard } from './security.guard';
import { JwtService } from '@/modules/auth/services/jwt.service';
import { RateLimiterService } from '@/shared/services/rate-limiter.service';
import { AuthService } from '@/modules/auth/auth.service';
import { Reflector } from '@nestjs/core';
import { createTestUser } from '@/test/setup';

type TokenType = 'access' | 'refresh';

describe('SecurityGuard', () => {
  let guard: SecurityGuard;
  let jwtService: JwtService;
  let rateLimiterService: RateLimiterService;
  let authService: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecurityGuard,
        {
          provide: JwtService,
          useValue: {
            validateAccessToken: jest.fn(),
          },
        },
        {
          provide: RateLimiterService,
          useValue: {
            checkRateLimit: jest.fn(),
            getUserKey: jest.fn(),
            getIPKey: jest.fn(),
          },
        },
        {
          provide: AuthService,
          useValue: {
            findUserById: jest.fn(),
          },
        },
        Reflector,
      ],
    }).compile();

    guard = module.get<SecurityGuard>(SecurityGuard);
    jwtService = module.get<JwtService>(JwtService);
    rateLimiterService = module.get<RateLimiterService>(RateLimiterService);
    authService = module.get<AuthService>(AuthService);
  });

  describe('canActivate', () => {
    it('should allow access to public routes without auth', async () => {
      const context = createMockExecutionContext('/health', {});
      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should authenticate user with valid JWT', async () => {
      const mockUser = createTestUser();
      const mockPayload = { sub: mockUser.id, email: mockUser.email, role: mockUser.role, type: 'access' as TokenType };
      
      jest.spyOn(jwtService, 'validateAccessToken').mockResolvedValue(mockPayload);
      jest.spyOn(authService, 'findUserById').mockResolvedValue(mockUser);
      jest.spyOn(rateLimiterService, 'checkRateLimit').mockResolvedValue({
        limit: 100,
        remaining: 99,
        reset: Date.now() + 60000,
      });

      const context = createMockExecutionContext('/compliance', {
        authorization: 'Bearer valid-token',
      });
      
      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should reject invalid JWT token', async () => {
      jest.spyOn(jwtService, 'validateAccessToken').mockRejectedValue(new Error('Invalid token'));

      const context = createMockExecutionContext('/compliance', {
        authorization: 'Bearer invalid-token',
      });

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('should apply rate limiting for authenticated users', async () => {
      const mockUser = createTestUser();
      const mockPayload = { sub: mockUser.id, email: mockUser.email, role: mockUser.role, type: 'access' as TokenType };
      
      jest.spyOn(jwtService, 'validateAccessToken').mockResolvedValue(mockPayload);
      jest.spyOn(authService, 'findUserById').mockResolvedValue(mockUser);
      jest.spyOn(rateLimiterService, 'getUserKey').mockResolvedValue('user-key');
      jest.spyOn(rateLimiterService, 'checkRateLimit').mockResolvedValue({
        limit: 30,
        remaining: 29,
        reset: Date.now() + 60000,
      });

      const context = createMockExecutionContext('/compliance', {
        authorization: 'Bearer valid-token',
      });
      
      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should allow admin access to any project', async () => {
      const mockUser = createTestUser({ role: 'admin' });
      const mockPayload = { sub: mockUser.id, email: mockUser.email, role: mockUser.role, type: 'access' as TokenType };
      
      jest.spyOn(jwtService, 'validateAccessToken').mockResolvedValue(mockPayload);
      jest.spyOn(authService, 'findUserById').mockResolvedValue(mockUser);
      jest.spyOn(rateLimiterService, 'checkRateLimit').mockResolvedValue({
        limit: 30,
        remaining: 29,
        reset: Date.now() + 60000,
      });

      const context = createMockExecutionContext('/compliance/project/123', {
        authorization: 'Bearer valid-token',
      });
      
      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should deny user access to unauthorized project', async () => {
      const mockUser = createTestUser({
        projects: [{ id: 1 }, { id: 2 }] // User has access to projects 1 and 2
      });
      const mockPayload = { sub: mockUser.id, email: mockUser.email, role: mockUser.role, type: 'access' as TokenType };
      
      jest.spyOn(jwtService, 'validateAccessToken').mockResolvedValue(mockPayload);
      jest.spyOn(authService, 'findUserById').mockResolvedValue(mockUser);
      jest.spyOn(rateLimiterService, 'checkRateLimit').mockResolvedValue({
        limit: 30,
        remaining: 29,
        reset: Date.now() + 60000,
      });

      const context = createMockExecutionContext('/compliance/project/999', {
        authorization: 'Bearer valid-token',
      });
      
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });
});

// Helper function using your existing test setup
function createMockExecutionContext(path: string, headers: any) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        route: { path },
        path,
        url: path,
        headers,
        ip: '127.0.0.1',
        user: null,
      }),
      getResponse: () => ({
        set: jest.fn(),
      }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as ExecutionContext;
}