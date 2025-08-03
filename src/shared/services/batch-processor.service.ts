import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface BatchConfig {
    maxConcurrency: number;
    batchSize: number;
    rateLimitDelay: number;
    retryAttempts: number;
    timeoutMs: number;
}
  
export interface BatchResult<T> {
    success: T[];
    failed: Array<{ item: any; error: Error }>;
    skipped: any[];
    total: number;
    duration: number;
}
  
export interface BatchProcessorOptions<T, R> {
    items: T[];
    processor: (item: T, index: number) => Promise<R>;
    validator?: (item: T) => boolean;
    onProgress?: (processed: number, total: number) => void;
    onError?: (item: T, error: Error) => void;
    config?: Partial<BatchConfig>;
}

@Injectable()
export class BatchProcessorService {
    private readonly logger = new Logger(BatchProcessorService.name);

    constructor(private configService: ConfigService) {}

    private getDefaultConfig(): BatchConfig {
        return {
          maxConcurrency: this.configService.get('BATCH_MAX_CONCURRENCY', 10),
          batchSize: this.configService.get('BATCH_SIZE', 50),
          rateLimitDelay: this.configService.get('BATCH_RATE_LIMIT_DELAY', 1000),
          retryAttempts: this.configService.get('BATCH_RETRY_ATTEMPTS', 3),
          timeoutMs: this.configService.get('BATCH_TIMEOUT_MS', 30000),
        };
    }

    async processBatch<T, R>(options: BatchProcessorOptions<T, R>): Promise<BatchResult<R>> {
        const config = { ...this.getDefaultConfig(), ...options.config };
        const startTime = Date.now();

        const result: BatchResult<R> = {
            success: [],
            failed: [],
            skipped: [],
            total: 0,
            duration: 0,
        };
        
        this.logger.log(`Starting batch processing of ${options.items.length} items`);

        const validItems = options.validator ? options.items.filter(options.validator) : options.items;

        const skippedCount = options.items.length - validItems.length;

        if (skippedCount > 0) {
            result.skipped = options.items.filter(item => !validItems.includes(item));
            this.logger.warn(`Skipped ${skippedCount} items due to validation failure`);
        }

        const chunks = this.chunkArray(validItems, config.batchSize);

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            this.logger.log(`Processing chunk ${i + 1}/${chunks.length} (${chunk.length} items)`);

            const chunkResult = await this.processChunkWithConcurrency(
                chunk,
                options.processor,
                config.maxConcurrency,
                options.onError
            )

            result.success.push(...chunkResult.success);
            result.failed.push(...chunkResult.failed);

            if (options.onProgress) {
                const processed = result.success.length + result.failed.length;
                options.onProgress(processed, validItems.length);
            }

            if (i < chunks.length - 1 && config.rateLimitDelay > 0) {
                await this.delay(config.rateLimitDelay);
            }
        }

        result.duration = Date.now() - startTime;
        this.logger.log(
            `Batch processing completed. Success: ${result.success.length}, ` +
            `Failed: ${result.failed.length}, Skipped: ${result.skipped.length}, ` +
            `Duration: ${result.duration}ms`
        );
      
        return result;
    }

    private async processChunkWithConcurrency<T, R>(
        items: T[],
        processor: (item: T, index: number) => Promise<R>,
        maxConcurrency: number,
        onError?: (item: T, error: Error) => void
    ): Promise<{ success: R[]; failed: Array<{ item: T; error: Error }> }> {
        const results: R[] = [];
        const failed: Array<{ item: T; error: Error }> = [];
        const executing: Promise<void>[] = [];

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const index = i;

            const promise = processor(item, index)
                .then(result => {
                    results.push(result);
                })
                .catch(error => {
                    const errorInfo = { item, error };
                    failed.push(errorInfo);
                    if (onError) onError(item, error);
                    this.logger.warn(`Failed to process item ${index}:`, error);
                })
            
            executing.push(promise);

            if (executing.length >= maxConcurrency) {
                await Promise.race(executing)
                executing.splice(executing.findIndex(p => p === executing[0]), 1);
            }
        }

        await Promise.all(executing);
        return { success: results, failed };
    }

    private chunkArray<T>(array: T[], size: number): T[][] {
        return Array.from({ length: Math.ceil(array.length / size) }, (_, i) =>
            array.slice(i * size, (i + 1) * size)
        );
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    groupBy<T, K extends string | number>(items: T[], keyExtractor: (item: T) => K): Map<K, T[]> {
        const groups = new Map<K, T[]>();

        for (const item of items) {
            const key = keyExtractor(item);

            if (!groups.has(key)) {
                groups.set(key, []);
            }

            groups.get(key)?.push(item);
        }

        return groups;
    }

    async processGroupedBatch<T, K extends string | number, R>(
        items: T[],
        keyExtractor: (item: T) => K,
        groupProcessor: (key: K, groupItems: T[]) => Promise<R[]>,
        config?: Partial<BatchConfig>
      ): Promise<BatchResult<R[]>> {
        const groups = this.groupBy(items, keyExtractor);
        const flattenedItems: Array<{ key: K; items: T[] }> = Array.from(groups.entries()).map(
          ([key, items]) => ({ key, items })
        );
    
        return this.processBatch({
          items: flattenedItems,
          processor: async ({ key, items }) => groupProcessor(key, items),
          config,
        });
    }
}