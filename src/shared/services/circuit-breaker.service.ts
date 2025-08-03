import { Injectable, Logger } from '@nestjs/common';

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
}

interface CircuitBreakerStats {
  failures: number;
  successes: number;
  lastFailureTime?: number;
  state: CircuitBreakerState;
}

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly circuits = new Map<string, CircuitBreakerStats>();
  private readonly defaultOptions: CircuitBreakerOptions = {
    failureThreshold: 5,
    recoveryTimeout: 60000, // 1 minute
    monitoringPeriod: 300000, // 5 minutes
  };

  async execute<T>(
    circuitName: string,
    operation: () => Promise<T>,
    options: Partial<CircuitBreakerOptions> = {},
  ): Promise<T> {
    const config = { ...this.defaultOptions, ...options };
    const circuit = this.getOrCreateCircuit(circuitName);

    // Check if circuit is open
    if (circuit.state === CircuitBreakerState.OPEN) {
      if (this.shouldAttemptReset(circuit, config)) {
        circuit.state = CircuitBreakerState.HALF_OPEN;
        this.logger.warn(`Circuit ${circuitName} transitioning to HALF_OPEN`);
      } else {
        throw new Error(`Circuit breaker ${circuitName} is OPEN`);
      }
    }

    try {
      const result = await operation();
      this.onSuccess(circuitName, circuit);
      return result;
    } catch (error) {
      this.onFailure(circuitName, circuit, config);
      throw error;
    }
  }

  private getOrCreateCircuit(circuitName: string): CircuitBreakerStats {
    if (!this.circuits.has(circuitName)) {
      this.circuits.set(circuitName, {
        failures: 0,
        successes: 0,
        state: CircuitBreakerState.CLOSED,
      });
    }
    return this.circuits.get(circuitName)!;
  }

  private onSuccess(circuitName: string, circuit: CircuitBreakerStats): void {
    circuit.successes++;

    if (circuit.state === CircuitBreakerState.HALF_OPEN) {
      circuit.state = CircuitBreakerState.CLOSED;
      circuit.failures = 0;
      this.logger.log(`Circuit ${circuitName} recovered and is now CLOSED`);
    }
  }

  private onFailure(
    circuitName: string,
    circuit: CircuitBreakerStats,
    config: CircuitBreakerOptions,
  ): void {
    circuit.failures++;
    circuit.lastFailureTime = Date.now();

    if (
      circuit.failures >= config.failureThreshold &&
      circuit.state === CircuitBreakerState.CLOSED
    ) {
      circuit.state = CircuitBreakerState.OPEN;
      this.logger.error(
        `Circuit ${circuitName} opened due to ${circuit.failures} failures`,
      );
    }
  }

  private shouldAttemptReset(
    circuit: CircuitBreakerStats,
    config: CircuitBreakerOptions,
  ): boolean {
    if (!circuit.lastFailureTime) return false;

    const timeSinceLastFailure = Date.now() - circuit.lastFailureTime;
    return timeSinceLastFailure >= config.recoveryTimeout;
  }

  getCircuitStatus(circuitName: string): CircuitBreakerStats | null {
    return this.circuits.get(circuitName) || null;
  }

  getAllCircuits(): Record<string, CircuitBreakerStats> {
    return Object.fromEntries(this.circuits.entries());
  }

  resetCircuit(circuitName: string): void {
    if (this.circuits.has(circuitName)) {
      this.circuits.set(circuitName, {
        failures: 0,
        successes: 0,
        state: CircuitBreakerState.CLOSED,
      });
      this.logger.log(`Circuit ${circuitName} manually reset`);
    }
  }
}
