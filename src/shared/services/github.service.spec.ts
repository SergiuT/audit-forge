import { Test, TestingModule } from '@nestjs/testing';
import { GitHubService } from './github.service';
import { RetryService } from './retry.service';
import { CircuitBreakerService } from './circuit-breaker.service';

// Mock Octokit
jest.mock('@octokit/rest');

describe('GitHubService', () => {
    let service: GitHubService;
    let retryService: jest.Mocked<RetryService>;
    let circuitBreakerService: jest.Mocked<CircuitBreakerService>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                GitHubService,
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

        service = module.get<GitHubService>(GitHubService);
        retryService = module.get(RetryService);
        circuitBreakerService = module.get(CircuitBreakerService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getUserInfo', () => {
        it('should successfully get user info with retry and circuit breaker', async () => {
            const token = 'test-token';
            const expectedUser = { id: 1, login: 'testuser' };

            retryService.withRetry.mockImplementation(async ({ execute }) => {
                return circuitBreakerService.execute('github-user-info', execute);
            });
            circuitBreakerService.execute.mockResolvedValue(expectedUser);

            const result = await service.getUserInfo(token);

            expect(result).toEqual(expectedUser);
            expect(retryService.withRetry).toHaveBeenCalledWith({
                execute: expect.any(Function),
                maxRetries: 3,
                retryDelay: expect.any(Function),
            });
            expect(circuitBreakerService.execute).toHaveBeenCalledWith('github-user-info', expect.any(Function));
        });

        it('should handle GitHub API failures', async () => {
            const token = 'test-token';
            const error = new Error('GitHub API rate limit exceeded');

            retryService.withRetry.mockRejectedValue(error);

            await expect(service.getUserInfo(token)).rejects.toThrow('GitHub API rate limit exceeded');
        });
    });

    describe('listUserRepos', () => {
        it('should successfully list user repos with retry and circuit breaker', async () => {
            const token = 'test-token';
            const expectedRepos = [{ id: 1, name: 'repo1' }, { id: 2, name: 'repo2' }];

            retryService.withRetry.mockImplementation(async ({ execute }) => {
                return circuitBreakerService.execute('github-list-repos', execute);
            });
            circuitBreakerService.execute.mockResolvedValue(expectedRepos);

            const result = await service.listUserRepos(token);

            expect(result).toEqual(expectedRepos);
            expect(retryService.withRetry).toHaveBeenCalledWith({
                execute: expect.any(Function),
                maxRetries: 3,
                retryDelay: expect.any(Function),
            });
            expect(circuitBreakerService.execute).toHaveBeenCalledWith('github-list-repos', expect.any(Function));
        });
    });

    describe('listOrgRepos', () => {
        it('should successfully list org repos with retry and circuit breaker', async () => {
            const token = 'test-token';
            const org = 'testorg';
            const expectedRepos = [{ id: 1, name: 'org-repo1' }];

            retryService.withRetry.mockImplementation(async ({ execute }) => {
                return circuitBreakerService.execute('github-org-repos', execute);
            });
            circuitBreakerService.execute.mockResolvedValue(expectedRepos);

            const result = await service.listOrgRepos(token, org);

            expect(result).toEqual(expectedRepos);
            expect(retryService.withRetry).toHaveBeenCalledWith({
                execute: expect.any(Function),
                maxRetries: 3,
                retryDelay: expect.any(Function),
            });
            expect(circuitBreakerService.execute).toHaveBeenCalledWith('github-org-repos', expect.any(Function));
        });
    });

    describe('getWorkflowRuns', () => {
        it('should successfully get workflow runs with retry and circuit breaker', async () => {
            const token = 'test-token';
            const owner = 'testowner';
            const repo = 'testrepo';
            const expectedRuns = [{ id: 1, name: 'workflow1' }];

            retryService.withRetry.mockImplementation(async ({ execute }) => {
                return circuitBreakerService.execute('github-workflow-runs', execute);
            });
            circuitBreakerService.execute.mockResolvedValue(expectedRuns);

            const result = await service.getWorkflowRuns(token, owner, repo);

            expect(result).toEqual(expectedRuns);
            expect(retryService.withRetry).toHaveBeenCalledWith({
                execute: expect.any(Function),
                maxRetries: 3,
                retryDelay: expect.any(Function),
            });
            expect(circuitBreakerService.execute).toHaveBeenCalledWith('github-workflow-runs', expect.any(Function));
        });
    });

    describe('listOrgs', () => {
        it('should successfully list orgs with retry and circuit breaker', async () => {
            const token = 'test-token';
            const expectedOrgs = [{ id: 1, login: 'org1' }];

            retryService.withRetry.mockImplementation(async ({ execute }) => {
                return circuitBreakerService.execute('github-list-orgs', execute);
            });
            circuitBreakerService.execute.mockResolvedValue(expectedOrgs);

            const result = await service.listOrgs(token);

            expect(result).toEqual(expectedOrgs);
            expect(retryService.withRetry).toHaveBeenCalledWith({
                execute: expect.any(Function),
                maxRetries: 3,
                retryDelay: expect.any(Function),
            });
            expect(circuitBreakerService.execute).toHaveBeenCalledWith('github-list-orgs', expect.any(Function));
        });
    });

    describe('Circuit Breaker Integration', () => {
        it('should use different circuit breakers for different operations', async () => {
            // Test getUserInfo
            retryService.withRetry.mockImplementation(async ({ execute }) => {
                return circuitBreakerService.execute('github-user-info', execute);
            });
            circuitBreakerService.execute.mockResolvedValue({ id: 1 });

            await service.getUserInfo('token');
            expect(circuitBreakerService.execute).toHaveBeenCalledWith('github-user-info', expect.any(Function));

            jest.clearAllMocks();

            // Test listUserRepos
            retryService.withRetry.mockImplementation(async ({ execute }) => {
                return circuitBreakerService.execute('github-list-repos', execute);
            });
            circuitBreakerService.execute.mockResolvedValue([]);

            await service.listUserRepos('token');
            expect(circuitBreakerService.execute).toHaveBeenCalledWith('github-list-repos', expect.any(Function));

            jest.clearAllMocks();

            // Test listOrgRepos
            retryService.withRetry.mockImplementation(async ({ execute }) => {
                return circuitBreakerService.execute('github-org-repos', execute);
            });
            circuitBreakerService.execute.mockResolvedValue([]);

            await service.listOrgRepos('token', 'org');
            expect(circuitBreakerService.execute).toHaveBeenCalledWith('github-org-repos', expect.any(Function));

            jest.clearAllMocks();

            // Test getWorkflowRuns
            retryService.withRetry.mockImplementation(async ({ execute }) => {
                return circuitBreakerService.execute('github-workflow-runs', execute);
            });
            circuitBreakerService.execute.mockResolvedValue([]);

            await service.getWorkflowRuns('token', 'owner', 'repo');
            expect(circuitBreakerService.execute).toHaveBeenCalledWith('github-workflow-runs', expect.any(Function));

            jest.clearAllMocks();

            // Test listOrgs
            retryService.withRetry.mockImplementation(async ({ execute }) => {
                return circuitBreakerService.execute('github-list-orgs', execute);
            });
            circuitBreakerService.execute.mockResolvedValue([]);

            await service.listOrgs('token');
            expect(circuitBreakerService.execute).toHaveBeenCalledWith('github-list-orgs', expect.any(Function));
        });
    });

    describe('Error Scenarios', () => {
        it('should handle GitHub API errors gracefully', async () => {
            const githubError = new Error('GitHub API unavailable');
            retryService.withRetry.mockRejectedValue(githubError);

            await expect(service.getUserInfo('token')).rejects.toThrow('GitHub API unavailable');
        });

        it('should use exponential backoff for retries', async () => {
            retryService.withRetry.mockResolvedValue({ id: 1 });

            await service.getUserInfo('token');

            const retryCall = retryService.withRetry.mock.calls[0][0];
            const retryDelay = retryCall.retryDelay!;

            // Test exponential backoff calculation
            expect(retryDelay(1)).toBe(2000); // 1000 * 2^1 = 2000
            expect(retryDelay(2)).toBe(4000); // 1000 * 2^2 = 4000
            expect(retryDelay(3)).toBe(8000); // 1000 * 2^3 = 8000
            expect(retryDelay(4)).toBe(10000); // Capped at 10000
        });
    });
}); 