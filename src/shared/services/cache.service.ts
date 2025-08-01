import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import Redis from 'ioredis';

@Injectable()
export class CacheService {
    private readonly logger = new Logger(CacheService.name);
    private readonly redisClient: Redis;
    private readonly isEnabled: boolean;
    private readonly defaultTtl = 3600; // 1 hour in seconds

    constructor(private configService: ConfigService) {
        this.isEnabled = this.configService.get<boolean>('ENABLE_CACHING') || false;

        if (this.isEnabled) {
            const redisURL = this.configService.get<string>('REDIS_URL');
            if (!redisURL) {
                throw new Error('REDIS_URL is not set');
            }
            this.redisClient = new Redis(redisURL);
            this.logger.log('Redis caching is enabled');
        }
    }

    async get<T>(key: string): Promise<T | null> {
        if (!this.isEnabled) {
            this.logger.debug(`Cache disabled, returning null for key: ${key}`);
            return null;
        }
    
        try {
            const value = await this.redisClient.get(key);
    
            if (!value) {
                this.logger.debug(`Cache miss for key: ${key}`);
                return null;
            }
    
            this.logger.debug(`Cache hit for key: ${key}`);
            return JSON.parse(value) as T;
        } catch (error) {
            this.logger.error(`Cache get error for key ${key}:`, error);
            return null;
        }
    }

    async set(key: string, value: any, ttlSeconds: number = this.defaultTtl): Promise<void> {
        if (!this.isEnabled) return;

        try {
            const serializedValue = JSON.stringify(value);
            await this.redisClient.setex(key, ttlSeconds, serializedValue);
            this.logger.debug(`Cache set for key: ${key}, TTL: ${ttlSeconds}s`);
        } catch (error) {
            this.logger.error(`Cache set error for key ${key}:`, error);
        }
    }

    async delete(key: string): Promise<void> {
        if (!this.isEnabled) return;

        try {
            await this.redisClient.del(key);
            this.logger.debug(`Cache deleted for key: ${key}`);
        } catch (error) {
            this.logger.error(`Cache delete error for key ${key}:`, error);
        }
    }

    async clear(): Promise<void> {
        if (!this.isEnabled) return;

        try {
            await this.redisClient.flushdb();
            this.logger.log('Cache cleared');
        } catch (error) {
            this.logger.error('Cache clear error:', error);
        }
    }

    // Utility method to generate cache keys for AI responses
    generateAIKey(input: string, model: string = 'default'): string {
        const hash = crypto.createHash('sha256').update(input).digest('hex');
        return `ai:${model}:${hash}`;
    }

    // Utility method to generate cache keys for compliance scores
    generateScoreKey(findings: any[]): string {
        const hash = crypto.createHash('sha256').update(JSON.stringify(findings)).digest('hex');
        return `score:${hash}`;
    }

    // Method with automatic caching for functions
    async getOrSet<T>(
        key: string,
        fn: () => Promise<T>,
        ttlSeconds: number = this.defaultTtl
    ): Promise<T> {
        const cached = await this.get<T>(key);
        if (cached !== null) {
            return cached;
        }

        const result = await fn();
        await this.set(key, result, ttlSeconds);
        return result;
    }

    // Get cache statistics
    async getStats(): Promise<{
        enabled: boolean;
        entriesCount: number;
        memoryUsage: string;
    }> {
        if (!this.isEnabled) {
            return {
                enabled: false,
                entriesCount: 0,
                memoryUsage: '0KB'
            };
        }

        try {
            const dbSize = await this.redisClient.dbsize();

            return {
                enabled: this.isEnabled,
                entriesCount: dbSize,
                memoryUsage: 'Redis managed'
            };
        } catch (error) {
            this.logger.error('Error getting cache stats:', error);
            return {
                enabled: this.isEnabled,
                entriesCount: 0,
                memoryUsage: 'Error'
            };
        }
    }
} 