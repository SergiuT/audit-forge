import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MonitoringService } from '../services/monitoring.service';

@Module({
    imports: [
        EventEmitterModule.forRoot({
            // Global event emitter configuration
            wildcard: true,
            delimiter: '.',
            maxListeners: 20,
            verboseMemoryLeak: true,
        }),
    ],
    providers: [MonitoringService],
    exports: [MonitoringService],
})
export class MonitoringModule { } 