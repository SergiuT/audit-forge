import { Controller, Post, Body, Query, Logger } from '@nestjs/common';
import { AIAgentService } from './ai-agent.service';
import { User } from '@/common/decorators/user.decorator';

interface ChatRequest {
    message: string;
    projectId?: string;
}

interface ChatResponse {
    response: string;
    timestamp: string;
}

@Controller('ai-agent')
export class AIAgentController {
    private readonly logger = new Logger(AIAgentController.name);

    constructor(private readonly aiAgentService: AIAgentService) { }

    @Post('chat')
    async chat(@Body() request: ChatRequest, @User() user): Promise<ChatResponse> {
        this.logger.log(`Agent chat request: ${request.message}`);

        const response = await this.aiAgentService.processMessage(
            request.message,
            { projectId: request.projectId, user }
        );

        return {
            response,
            timestamp: new Date().toISOString(),
        };
    }

    @Post('scan')
    async quickScan(@Query('projectId') projectId: string, @User() user): Promise<ChatResponse> {
        if (!projectId) {
            return {
                response: 'Please provide a projectId query parameter.',
                timestamp: new Date().toISOString(),
            };
        }

        const message = `Please scan all GitHub repositories for compliance issues in project ${projectId}`;

        const response = await this.aiAgentService.processMessage(
            message,
            { projectId, user }
        );

        return {
            response,
            timestamp: new Date().toISOString(),
        };
    }
} 