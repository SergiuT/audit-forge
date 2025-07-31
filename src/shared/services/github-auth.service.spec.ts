import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GitHubAuthService } from './github-auth.service';
import { RetryService } from './retry.service';
import { CircuitBreakerService } from './circuit-breaker.service';

// Mock axios
jest.mock('axios');

describe('GitHubAuthService', () => {
    let service: GitHubAuthService;
    let retryService: jest.Mocked<RetryService>;
    let circuitBreakerService: jest.Mocked<CircuitBreakerService>;
    let configService: jest.Mocked<ConfigService>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                GitHubAuthService,
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn((key: string) => {
                            const config = {
                                GITHUB_CLIENT_ID: 'test-client-id',
                                GITHUB_CLIENT_SECRET: 'test-client-secret',
                            };
                            return config[key];
                        }),
                    },
                },
                {
                    provide: RetryService,
                    useValue: {
                        withRetry: jest.fn(),
                    },
                },
                {
                    provide: CircuitBreakerService,
                    useValue: {
                        execute: jest.fn(),
                    },
                },
            ],
        }).compile();

        service = module.get<GitHubAuthService>(GitHubAuthService);
        retryService = module.get(RetryService);
        circuitBreakerService = module.get(CircuitBreakerService);
        configService = module.get(ConfigService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('exchangeCodeForToken', () => {
        it('should successfully exchange code for token with retry and circuit breaker', async () => {
            const code = 'test-auth-code';
            const expectedToken = 'test-access-token';

            retryService.withRetry.mockImplementation(async ({ execute }) => {
                return circuitBreakerService.execute('github-oauth', execute);
            });
            circuitBreakerService.execute.mockResolvedValue(expectedToken);

            const result = await service.exchangeCodeForToken(code);

            expect(result).toBe(expectedToken);
            expect(retryService.withRetry).toHaveBeenCalledWith({
                execute: expect.any(Function),
                maxRetries: 3,
                retryDelay: expect.any(Function),
            });
            expect(circuitBreakerService.execute).toHaveBeenCalledWith('github-oauth', expect.any(Function));
        });

        it('should handle OAuth failures', async () => {
            const code = 'test-auth-code';
            const error = new Error('GitHub OAuth failed: invalid_code');

            retryService.withRetry.mockRejectedValue(error);

            await expect(service.exchangeCodeForToken(code)).rejects.toThrow('GitHub OAuth failed: invalid_code');
        });

        it('should use exponential backoff for retries', async () => {
            retryService.withRetry.mockResolvedValue('test-token');

            await service.exchangeCodeForToken('test-code');

            const retryCall = retryService.withRetry.mock.calls[0][0];
            const retryDelay = retryCall.retryDelay!;

            // Test exponential backoff calculation
            expect(retryDelay(1)).toBe(2000); // 1000 * 2^1 = 2000
            expect(retryDelay(2)).toBe(4000); // 1000 * 2^2 = 4000
            expect(retryDelay(3)).toBe(8000); // 1000 * 2^3 = 8000
            expect(retryDelay(4)).toBe(10000); // Capped at 10000
        });
    });

    describe('Error Scenarios', () => {
        it('should handle GitHub OAuth errors gracefully', async () => {
            const oauthError = new Error('GitHub OAuth service unavailable');
            retryService.withRetry.mockRejectedValue(oauthError);

            await expect(service.exchangeCodeForToken('test-code')).rejects.toThrow('GitHub OAuth service unavailable');
        });
    });
}); 