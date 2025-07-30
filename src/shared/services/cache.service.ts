import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

interface CacheEntry {
    value: any;
    expiresAt: number;
    createdAt: number;
}

@Injectable()
export class CacheService {
    private readonly logger = new Logger(CacheService.name);
    private readonly memoryCache = new Map<string, CacheEntry>();
    private readonly isEnabled: boolean;
    private readonly defaultTtl = 3600; // 1 hour in seconds

    constructor(private configService: ConfigService) {
        this.isEnabled = this.configService.get<boolean>('ENABLE_CACHING') || false;

        if (this.isEnabled) {
            this.logger.log('Caching is enabled');
            // Start cleanup interval for memory cache
            setInterval(() => this.cleanupExpiredEntries(), 300000); // 5 minutes
        }
    }

    async get<T>(key: string): Promise<T | null> {
        if (!this.isEnabled) return null;

        try {
            const entry = this.memoryCache.get(key);

            if (!entry) {
                return null;
            }

            if (Date.now() > entry.expiresAt) {
                this.memoryCache.delete(key);
                return null;
            }

            this.logger.debug(`Cache hit for key: ${key}`);
            return entry.value as T;
        } catch (error) {
            this.logger.error(`Cache get error for key ${key}:`, error);
            return null;
        }
    }

    async set(key: string, value: any, ttlSeconds: number = this.defaultTtl): Promise<void> {
        if (!this.isEnabled) return;

        try {
            const expiresAt = Date.now() + (ttlSeconds * 1000);
            const entry: CacheEntry = {
                value,
                expiresAt,
                createdAt: Date.now(),
            };

            this.memoryCache.set(key, entry);
            this.logger.debug(`Cache set for key: ${key}, TTL: ${ttlSeconds}s`);
        } catch (error) {
            this.logger.error(`Cache set error for key ${key}:`, error);
        }
    }

    async delete(key: string): Promise<void> {
        if (!this.isEnabled) return;

        try {
            this.memoryCache.delete(key);
            this.logger.debug(`Cache deleted for key: ${key}`);
        } catch (error) {
            this.logger.error(`Cache delete error for key ${key}:`, error);
        }
    }

    async clear(): Promise<void> {
        if (!this.isEnabled) return;

        try {
            this.memoryCache.clear();
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
    getStats(): {
        enabled: boolean;
        entriesCount: number;
        memoryUsage: string;
    } {
        const entriesCount = this.memoryCache.size;
        const memoryUsage = `${Math.round(JSON.stringify([...this.memoryCache.entries()]).length / 1024)}KB`;

        return {
            enabled: this.isEnabled,
            entriesCount,
            memoryUsage,
        };
    }

    private cleanupExpiredEntries(): void {
        if (!this.isEnabled) return;

        const now = Date.now();
        let cleanedCount = 0;

        for (const [key, entry] of this.memoryCache.entries()) {
            if (now > entry.expiresAt) {
                this.memoryCache.delete(key);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            this.logger.debug(`Cleaned up ${cleanedCount} expired cache entries`);
        }
    }
} 