import { Module } from '@nestjs/common';
import { AIAgentService } from './ai-agent.service';
import { SharedModule } from '@/shared/shared.module';
import { IntegrationsModule } from '@/modules/integrations/integrations.module';
import { AIAgentController } from './ai-agent.controller';
import { HttpModule } from '@nestjs/axios';
import { ComplianceRule } from '../compliance/entities/compliance-rule.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
    imports: [
        SharedModule, // For OpenAI service
        IntegrationsModule, // For GitHub scan service
        HttpModule,
        TypeOrmModule.forFeature([ComplianceRule])
    ],
    controllers: [AIAgentController],
    providers: [AIAgentService],
    exports: [AIAgentService],
})
export class AIAgentsModule { } 