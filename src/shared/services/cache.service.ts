import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import Redis from 'ioredis';

interface CacheEntry {
    value: any;
    expiresAt: number;
    createdAt: number;
}

interface CacheTag {
    key: string;
    tags: string[];
    expiresAt: number;
}

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
        if (!this.isEnabled) return null;

        try {
            const value = await this.redisClient.get(key);

            if (!value) {
                return null;
            }

            return JSON.parse(value) as T;
        } catch (error) {
            this.logger.error(`Cache get error for key ${key}:`, error);
            return null;
        }
    }

    async set(key: string, value: any, ttlSeconds: number = this.defaultTtl, tags?: string[]): Promise<void> {
        if (!this.isEnabled) return;

        try {
            const serializedValue = JSON.stringify(value);
            await this.redisClient.setex(key, ttlSeconds, serializedValue);
            
            // Store cache tags if provided
            if (tags && tags.length > 0) {
                await this.setCacheTags(key, tags, ttlSeconds);
            }
            
            this.logger.debug(`Cache set for key: ${key}, TTL: ${ttlSeconds}s, tags: ${tags?.join(',') || 'none'}`);
        } catch (error) {
            this.logger.error(`Cache set error for key ${key}:`, error);
        }
    }

    async delete(key: string): Promise<void> {
        if (!this.isEnabled) return;

        try {
            await this.redisClient.del(key);
            // Also remove associated tags
            await this.removeCacheTags(key);
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

    // Pattern-based cache invalidation
    async invalidatePattern(pattern: string): Promise<number> {
        if (!this.isEnabled) return 0;

        try {
            const keys = await this.redisClient.keys(pattern);
            if (keys.length > 0) {
                const deleted = await this.redisClient.del(...keys);
                this.logger.debug(`Invalidated ${deleted} keys matching pattern: ${pattern}`);
                return deleted;
            }
            return 0;
        } catch (error) {
            this.logger.error(`Cache pattern invalidation error for pattern ${pattern}:`, error);
            return 0;
        }
    }

    // Tag-based cache invalidation
    async invalidateByTag(tag: string): Promise<number> {
        if (!this.isEnabled) return 0;

        try {
            const tagKey = `tag:${tag}`;
            const keys = await this.redisClient.smembers(tagKey);
            
            if (keys.length > 0) {
                const deleted = await this.redisClient.del(...keys);
                await this.redisClient.del(tagKey);
                this.logger.debug(`Invalidated ${deleted} keys for tag: ${tag}`);
                return deleted;
            }
            return 0;
        } catch (error) {
            this.logger.error(`Cache tag invalidation error for tag ${tag}:`, error);
            return 0;
        }
    }

    // Invalidate multiple tags at once
    async invalidateByTags(tags: string[]): Promise<number> {
        if (!this.isEnabled) return 0;

        let totalDeleted = 0;
        for (const tag of tags) {
            totalDeleted += await this.invalidateByTag(tag);
        }
        return totalDeleted;
    }

    // Domain-specific cache invalidation methods
    async invalidateComplianceReports(projectId?: number): Promise<number> {
        if (projectId) {
            return await this.invalidatePattern(`reports:project:${projectId}`);
        }
        return await this.invalidatePattern('reports:*');
    }

    async invalidateComplianceFindings(reportId?: number): Promise<number> {
        if (reportId) {
            return await this.invalidatePattern(`findings:report:${reportId}`);
        }
        return await this.invalidatePattern('findings:*');
    }

    async invalidateUserData(userId: number): Promise<number> {
        const patterns = [
            `user:${userId}:*`,
            `reports:user:${userId}`,
            `sessions:user:${userId}`
        ];
        
        let totalDeleted = 0;
        for (const pattern of patterns) {
            totalDeleted += await this.invalidatePattern(pattern);
        }
        return totalDeleted;
    }

    async invalidateAIResponses(model?: string): Promise<number> {
        const pattern = model ? `ai:${model}:*` : 'ai:*';
        return await this.invalidatePattern(pattern);
    }

    async invalidateComplianceScores(): Promise<number> {
        return await this.invalidatePattern('score:*');
    }

    // Cache dependency tracking
    async addCacheDependency(parentKey: string, dependentKey: string): Promise<void> {
        if (!this.isEnabled) return;

        try {
            const dependencyKey = `dep:${parentKey}`;
            await this.redisClient.sadd(dependencyKey, dependentKey);
            await this.redisClient.expire(dependencyKey, this.defaultTtl);
        } catch (error) {
            this.logger.error(`Error adding cache dependency:`, error);
        }
    }

    async invalidateDependencies(parentKey: string): Promise<number> {
        if (!this.isEnabled) return 0;

        try {
            const dependencyKey = `dep:${parentKey}`;
            const dependentKeys = await this.redisClient.smembers(dependencyKey);
            
            if (dependentKeys.length > 0) {
                const deleted = await this.redisClient.del(...dependentKeys);
                await this.redisClient.del(dependencyKey);
                this.logger.debug(`Invalidated ${deleted} dependent keys for: ${parentKey}`);
                return deleted;
            }
            return 0;
        } catch (error) {
            this.logger.error(`Error invalidating cache dependencies:`, error);
            return 0;
        }
    }

    // Cache warming methods
    async warmCache<T>(key: string, data: T, ttlSeconds?: number): Promise<void> {
        await this.set(key, data, ttlSeconds);
        this.logger.debug(`Cache warmed for key: ${key}`);
    }

    async warmComplianceCache(projectId: number, reports: any[]): Promise<void> {
        const cacheKey = `reports:project:${projectId}`;
        await this.warmCache(cacheKey, reports, 1800); // 30 minutes
    }

    // Cache health and monitoring
    async getCacheHealth(): Promise<{
        enabled: boolean;
        connected: boolean;
        memoryUsage: string;
        hitRate?: number;
    }> {
        if (!this.isEnabled) {
            return {
                enabled: false,
                connected: false,
                memoryUsage: '0KB'
            };
        }

        try {
            const info = await this.redisClient.info('memory');
            const memoryMatch = info.match(/used_memory_human:(\S+)/);
            const memoryUsage = memoryMatch ? memoryMatch[1] : 'Unknown';

            return {
                enabled: this.isEnabled,
                connected: true,
                memoryUsage
            };
        } catch (error) {
            this.logger.error('Error getting cache health:', error);
            return {
                enabled: this.isEnabled,
                connected: false,
                memoryUsage: 'Error'
            };
        }
    }

    // Private helper methods
    private async setCacheTags(key: string, tags: string[], ttlSeconds: number): Promise<void> {
        try {
            for (const tag of tags) {
                const tagKey = `tag:${tag}`;
                await this.redisClient.sadd(tagKey, key);
                await this.redisClient.expire(tagKey, ttlSeconds);
            }
        } catch (error) {
            this.logger.error(`Error setting cache tags for key ${key}:`, error);
        }
    }

    private async removeCacheTags(key: string): Promise<void> {
        try {
            // Find all tags that contain this key and remove it
            const tagPattern = 'tag:*';
            const tagKeys = await this.redisClient.keys(tagPattern);
            
            for (const tagKey of tagKeys) {
                await this.redisClient.srem(tagKey, key);
            }
        } catch (error) {
            this.logger.error(`Error removing cache tags for key ${key}:`, error);
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
        ttlSeconds: number = this.defaultTtl,
        tags?: string[]
    ): Promise<T> {
        const cached = await this.get<T>(key);
        if (cached !== null) {
            return cached;
        }

        const result = await fn();
        await this.set(key, result, ttlSeconds, tags);
        return result;
    }

    // Get cache statistics
    async getStats(): Promise<{
        enabled: boolean;
        entriesCount: number;
        memoryUsage: string;
        tagsCount: number;
    }> {
        if (!this.isEnabled) {
            return {
                enabled: false,
                entriesCount: 0,
                memoryUsage: '0KB',
                tagsCount: 0
            };
        }

        try {
            const dbSize = await this.redisClient.dbsize();
            const tagKeys = await this.redisClient.keys('tag:*');
            
            return {
                enabled: this.isEnabled,
                entriesCount: dbSize,
                memoryUsage: 'Redis managed',
                tagsCount: tagKeys.length
            };
        } catch (error) {
            this.logger.error('Error getting cache stats:', error);
            return {
                enabled: this.isEnabled,
                entriesCount: 0,
                memoryUsage: 'Error',
                tagsCount: 0
            };
        }
    }
} 