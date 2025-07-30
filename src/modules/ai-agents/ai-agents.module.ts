import { Module } from '@nestjs/common';
import { AIAgentService } from './ai-agent.service';
import { SharedModule } from '@/shared/shared.module';
import { IntegrationsModule } from '@/modules/integrations/integrations.module';
import { AIAgentController } from './ai-agent.controller';
import { HttpModule } from '@nestjs/axios';

@Module({
    imports: [
        SharedModule, // For OpenAI service
        IntegrationsModule, // For GitHub scan service
        HttpModule,
    ],
    controllers: [AIAgentController],
    providers: [AIAgentService],
    exports: [AIAgentService],
})
export class AIAgentsModule { } 