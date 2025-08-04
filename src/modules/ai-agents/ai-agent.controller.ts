import { Controller, Post, Body, Query, Logger, InternalServerErrorException } from '@nestjs/common';
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
        this.logger.log(`Starting AI agent chat for user ${user.id}`, {
            message: request.message.substring(0, 100) + (request.message.length > 100 ? '...' : ''),
            projectId: request.projectId
        });

        try {
            const response = await this.aiAgentService.processMessage(
                request.message,
                { projectId: request.projectId, user }
            );

            this.logger.log(`Successfully processed AI agent chat for user ${user.id}`);
            return {
                response,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            this.logger.error(`Failed to process AI agent chat for user ${user.id}`, error.stack);
            throw new InternalServerErrorException('Failed to process AI agent chat');
        }
    }

    @Post('scan')
    async quickScan(@Query('projectId') projectId: string, @User() user): Promise<ChatResponse> {
        this.logger.log(`Starting AI agent quick scan for project ${projectId} by user ${user.id}`);

        try {
            if (!projectId) {
                this.logger.warn(`No projectId provided for AI agent quick scan by user ${user.id}`);
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

            this.logger.log(`Successfully completed AI agent quick scan for project ${projectId} by user ${user.id}`);
            return {
                response,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            this.logger.error(`Failed to process AI agent quick scan for project ${projectId} by user ${user.id}`, error.stack);
            throw new InternalServerErrorException('Failed to process AI agent quick scan');
        }
    }
} 