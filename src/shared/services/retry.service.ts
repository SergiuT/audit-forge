import { Injectable, Logger } from '@nestjs/common';

interface CircuitBreakerState {
    failures: number;
    lastFailure: Date | null;
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

interface RetryOptions<T> {
    maxRetries: number;
    retryCondition?: (error: any) => boolean;
    retryDelay?: (retryCount: number) => number;
    execute: () => Promise<T>;
    useCircuitBreaker?: boolean;
}

@Injectable()
export class RetryService {
    private readonly logger = new Logger(RetryService.name);
    private readonly circuitBreakers = new Map<string, CircuitBreakerState>();
    private readonly FAILURE_THRESHOLD = 5;
    private readonly RESET_TIMEOUT = 60000; // 1 minute

    private getCircuitBreaker(service: string): CircuitBreakerState {
        if (!this.circuitBreakers.has(service)) {
            this.circuitBreakers.set(service, {
                failures: 0,
                lastFailure: null,
                state: 'CLOSED'
            });
        }
        return this.circuitBreakers.get(service)!;
    }

    private async checkCircuitBreaker(service: string): Promise<boolean> {
        const breaker = this.getCircuitBreaker(service);

        switch (breaker.state) {
            case 'OPEN':
                if (breaker.lastFailure && Date.now() - breaker.lastFailure.getTime() > this.RESET_TIMEOUT) {
                    breaker.state = 'HALF_OPEN';
                    this.logger.log(`Circuit breaker for ${service} entering HALF_OPEN state`);
                    return true;
                }
                return false;

            case 'HALF_OPEN':
                return true;

            case 'CLOSED':
                return true;
        }
    }

    private handleSuccess(service: string): void {
        const breaker = this.getCircuitBreaker(service);
        breaker.failures = 0;
        breaker.state = 'CLOSED';
        this.logger.log(`Circuit breaker for ${service} reset to CLOSED state`);
    }

    private handleFailure(service: string): void {
        const breaker = this.getCircuitBreaker(service);
        breaker.failures++;
        breaker.lastFailure = new Date();

        if (breaker.failures >= this.FAILURE_THRESHOLD) {
            breaker.state = 'OPEN';
            this.logger.warn(`Circuit breaker for ${service} OPENED after ${breaker.failures} failures`);
        }
    }

    async withRetry<T>({
        maxRetries,
        retryCondition,
        retryDelay,
        execute,
        useCircuitBreaker = true
    }: RetryOptions<T>): Promise<T> {
        let lastError: Error | null = null;
        let attempt = 0;
        const service = execute.toString().slice(0, 32); // Use function signature as service identifier

        if (useCircuitBreaker && !(await this.checkCircuitBreaker(service))) {
            throw new Error(`Circuit breaker is OPEN for service ${service}`);
        }

        while (attempt < maxRetries) {
            try {
                const result = await execute();
                if (useCircuitBreaker) {
                    this.handleSuccess(service);
                }
                return result;
            } catch (error) {
                lastError = error;
                attempt++;

                if (useCircuitBreaker) {
                    this.handleFailure(service);
                }

                if (retryCondition && !retryCondition(error)) {
                    throw error;
                }

                if (attempt < maxRetries) {
                    const delay = retryDelay ? retryDelay(attempt) : Math.min(1000 * Math.pow(2, attempt), 10000);
                    this.logger.warn(`Retry attempt ${attempt}/${maxRetries} after ${delay}ms`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw lastError;
    }
} 