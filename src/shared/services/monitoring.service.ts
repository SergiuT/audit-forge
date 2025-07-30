import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface MonitoringEvent {
    service: string;
    type: 'ERROR' | 'WARNING' | 'INFO';
    message: string;
    timestamp: Date;
    metadata?: Record<string, any>;
}

export interface AlertConfig {
    type: string;
    threshold: number;
    timeWindow: number; // in milliseconds
    action: 'notify' | 'escalate' | 'auto_remediate';
}

@Injectable()
export class MonitoringService {
    private readonly logger = new Logger(MonitoringService.name);
    private readonly events: MonitoringEvent[] = [];
    private readonly alertConfigs: Map<string, AlertConfig> = new Map();
    private readonly eventCounts: Map<string, { count: number; firstSeen: Date }> = new Map();

    constructor(private readonly eventEmitter: EventEmitter2) {
        // Default alert configs
        this.setAlertConfig('rate_limit', {
            type: 'ERROR',
            threshold: 5,
            timeWindow: 300000, // 5 minutes
            action: 'notify'
        });

        this.setAlertConfig('api_error', {
            type: 'ERROR',
            threshold: 10,
            timeWindow: 300000,
            action: 'escalate'
        });

        this.setAlertConfig('auth_failure', {
            type: 'ERROR',
            threshold: 3,
            timeWindow: 300000,
            action: 'escalate'
        });

        // Set up event listeners
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        this.eventEmitter.on('monitoring.alert.notify', (alert: any) => {
            this.logger.warn(`Alert triggered: ${alert.key}`, alert);
        });

        this.eventEmitter.on('monitoring.alert.escalate', (alert: any) => {
            this.logger.error(`Alert escalated: ${alert.key}`, alert);
        });

        this.eventEmitter.on('monitoring.alert.remediate', (alert: any) => {
            this.logger.warn(`Auto-remediation triggered: ${alert.key}`, alert);
        });
    }

    setAlertConfig(key: string, config: AlertConfig): void {
        this.alertConfigs.set(key, config);
    }

    async emitEvent(event: MonitoringEvent) {
        try {
            this.events.push(event);
            this.logger.log(`[${event.type}] ${event.service}: ${event.message}`);
            await this.eventEmitter.emit('monitoring.event', event);
        } catch (error) {
            this.logger.error('Error emitting monitoring event:', error);
        }
    }

    async handleEvent(event: MonitoringEvent) {
        try {
            // Store event for analysis
            this.events.push(event);

            // Log based on event type
            switch (event.type) {
                case 'ERROR':
                    this.logger.error(`[${event.service}] ${event.message}`, event.metadata);
                    break;
                case 'WARNING':
                    this.logger.warn(`[${event.service}] ${event.message}`, event.metadata);
                    break;
                case 'INFO':
                    this.logger.log(`[${event.service}] ${event.message}`, event.metadata);
                    break;
            }
        } catch (error) {
            this.logger.error('Error handling monitoring event:', error);
        }
    }

    private async checkAlerts(event: MonitoringEvent): Promise<void> {
        for (const [key, config] of this.alertConfigs.entries()) {
            if (event.type === config.type) {
                const eventKey = `${key}-${event.service}`;
                const current = this.eventCounts.get(eventKey) || { count: 0, firstSeen: new Date() };

                // Reset counter if outside time window
                if (Date.now() - current.firstSeen.getTime() > config.timeWindow) {
                    current.count = 1;
                    current.firstSeen = new Date();
                } else {
                    current.count++;
                }

                this.eventCounts.set(eventKey, current);

                // Check if threshold is exceeded
                if (current.count >= config.threshold) {
                    await this.handleAlert(key, config, event);
                    // Reset counter after alert
                    this.eventCounts.delete(eventKey);
                }
            }
        }
    }

    private async handleAlert(key: string, config: AlertConfig, event: MonitoringEvent): Promise<void> {
        const alert = {
            key,
            config,
            event,
            timestamp: new Date()
        };

        switch (config.action) {
            case 'notify':
                await this.eventEmitter.emitAsync('monitoring.alert.notify', alert);
                break;

            case 'escalate':
                await this.eventEmitter.emitAsync('monitoring.alert.escalate', alert);
                break;

            case 'auto_remediate':
                await this.eventEmitter.emitAsync('monitoring.alert.remediate', alert);
                break;
        }
    }

    private cleanupOldEvents(): void {
        const now = Date.now();
        const oldestToKeep = now - (24 * 60 * 60 * 1000); // Keep last 24 hours

        while (
            this.events.length > 0 &&
            this.events[0].timestamp.getTime() < oldestToKeep
        ) {
            this.events.shift();
        }
    }

    getEvents(
        service?: string,
        type?: 'ERROR' | 'WARNING' | 'INFO',
        since?: Date
    ): MonitoringEvent[] {
        return this.events.filter(event =>
            (!service || event.service === service) &&
            (!type || event.type === type) &&
            (!since || event.timestamp >= since)
        );
    }

    getServiceHealth(service: string): {
        status: 'healthy' | 'degraded' | 'critical';
        errors: number;
        warnings: number;
    } {
        const last5Min = new Date(Date.now() - 5 * 60 * 1000);
        const recentEvents = this.getEvents(service, undefined, last5Min);

        const errors = recentEvents.filter(e => e.type === 'ERROR').length;
        const warnings = recentEvents.filter(e => e.type === 'WARNING').length;

        let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
        if (errors > 10) status = 'critical';
        else if (errors > 0 || warnings > 5) status = 'degraded';

        return { status, errors, warnings };
    }
} 