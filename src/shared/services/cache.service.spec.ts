import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';

describe('CacheService', () => {
    let service: CacheService;
    let configService: ConfigService;

    const mockConfigService = {
        get: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CacheService,
                {
                    provide: ConfigService,
                    useValue: mockConfigService,
                },
            ],
        }).compile();

        service = module.get<CacheService>(CacheService);
        configService = module.get<ConfigService>(ConfigService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('when caching is disabled', () => {
        beforeEach(() => {
            mockConfigService.get.mockReturnValue(false);
        });

        it('should be defined', () => {
            expect(service).toBeDefined();
        });

        it('should return null when getting from cache', async () => {
            const result = await service.get('test-key');
            expect(result).toBeNull();
        });

        it('should not store values when setting cache', async () => {
            await service.set('test-key', 'test-value');
            const result = await service.get('test-key');
            expect(result).toBeNull();
        });
    });

    describe('when caching is enabled', () => {
        beforeEach(() => {
            mockConfigService.get.mockReturnValue(true);
            // Create a new service instance with caching enabled
            service = new CacheService(configService);
        });

        it('should store and retrieve values', async () => {
            const testValue = { message: 'test data' };
            await service.set('test-key', testValue, 3600);

            const result = await service.get('test-key');
            expect(result).toEqual(testValue);
        });

        it('should return null for expired entries', async () => {
            await service.set('test-key', 'test-value', 0.001); // 1ms TTL

            // Wait for expiration
            await new Promise(resolve => setTimeout(resolve, 10));

            const result = await service.get('test-key');
            expect(result).toBeNull();
        });

        it('should generate consistent AI keys', () => {
            const input = 'test input';
            const model = 'gpt-3.5-turbo';

            const key1 = service.generateAIKey(input, model);
            const key2 = service.generateAIKey(input, model);

            expect(key1).toBe(key2);
            expect(key1).toContain('ai:');
            expect(key1).toContain(model);
        });

        it('should clear all cache entries', async () => {
            await service.set('key1', 'value1');
            await service.set('key2', 'value2');

            await service.clear();

            const result1 = await service.get('key1');
            const result2 = await service.get('key2');

            expect(result1).toBeNull();
            expect(result2).toBeNull();
        });

        it('should provide cache statistics', () => {
            const stats = service.getStats();

            expect(stats).toHaveProperty('enabled');
            expect(stats).toHaveProperty('entriesCount');
            expect(stats).toHaveProperty('memoryUsage');
            expect(stats.enabled).toBe(true);
        });

        it('should implement getOrSet pattern', async () => {
            const mockFn = jest.fn().mockResolvedValue('computed-value');

            // First call should execute function
            const result1 = await service.getOrSet('test-key', mockFn, 3600);
            expect(result1).toBe('computed-value');
            expect(mockFn).toHaveBeenCalledTimes(1);

            // Second call should return cached value
            const result2 = await service.getOrSet('test-key', mockFn, 3600);
            expect(result2).toBe('computed-value');
            expect(mockFn).toHaveBeenCalledTimes(1); // Not called again
        });
    });
}); 