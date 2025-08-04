import { Injectable, Logger } from '@nestjs/common';
import { OpenAIService } from '@/shared/services/openai.service';
import { User } from '../auth/entities/user.entity';
import { agentFunctions, generateNormalizationPrompt } from '@/shared/utils/ai-agent.util';
import { ComplianceFindingResult, LogNormalizationResult, NormalizedLogEvent, SeverityOptions } from '@/shared/types/types';
import { PineconeService } from '@/shared/services/pinecone.service';
import { BatchProcessorService } from '@/shared/services/batch-processor.service';
import { RetryService } from '@/shared/services/retry.service';

@Injectable()
export class AIAgentService {
    private readonly logger = new Logger(AIAgentService.name);

    constructor(
        private readonly openaiService: OpenAIService,
        private readonly pineconeService: PineconeService,
        private readonly batchProcessorService: BatchProcessorService,
        private readonly retryService: RetryService,
    ) { }

    async processMessage(message: string, context: { projectId?: string; user: User }): Promise<string> {
        this.logger.log(`Processing agent message: ${message}`);

        const messages = [
            {
                role: 'system',
                content: `You are a professional AI compliance assistant specializing in SOC2, ISO27001, and DORA frameworks. 

                You have access to:
                1. **Professional Compliance Knowledge**: Vector database with compliance controls
                2. **Platform API Routes**: Complete documentation of all 39 API endpoints
                3. **Integration Capabilities**: GitHub, AWS, GCP scanning and analysis
                4. **Real-time Control Search**: Vector-based search across compliance frameworks

                You help organizations by:
                - Explaining specific compliance requirements with authoritative sources
                - Providing implementation guidance based on professional standards  
                - Scanning systems for compliance gaps
                - Mapping findings to exact control requirements
                - Offering remediation strategies with cross-framework references

                Always provide specific, actionable guidance with professional expertise.

                Available context: ${context.projectId ? `Project ID: ${context.projectId}` : 'No project context'}`
            },
            {
                role: 'user',
                content: message
            }
        ];

        try {
            const response = await this.openaiService.callWithFunctions(
                messages,
                agentFunctions,
                { temperature: 0.1 }
            );

            if (response.functionCall) {
                this.logger.log(`Agent calling function: ${response.functionCall.name}`);

                const functionResult = await this.executeFunction(
                    response.functionCall.name,
                    response.functionCall.arguments,
                    context
                );

                // Send the function result back to the LLM for interpretation
                const followUpMessages = [
                    ...messages,
                    response.message,
                    {
                        role: 'tool',
                        tool_call_id: response.message.tool_calls[0].id,
                        content: JSON.stringify(functionResult)
                    }
                ];

                const finalResponse = await this.openaiService.callWithFunctions(
                    followUpMessages,
                    agentFunctions,
                    { temperature: 0.1 }
                );

                return finalResponse.message.content || 'I completed your request successfully.';
            }

            return response.message.content || 'I\'m here to help with compliance questions. Ask me about SOC2, ISO27001, or DORA requirements!';
        } catch (error) {
            this.logger.error(`Agent processing error: ${error.message}`);
            return `I encountered an error processing your request: ${error.message}. Please try rephrasing your question.`;
        }
    }

    private async executeFunction(name: string, args: any, context: { projectId?: string; user: User }): Promise<any> {
        switch (name) {
            case 'search_compliance_controls':
                return this.pineconeService.searchComplianceControls(args.query, args.topK);

            case 'analyze_logs_for_compliance':
                return this.analyzeLogsForCompliance(args.logContent, args.logType);

            default:
                throw new Error(`Unknown function: ${name}`);
        }
    }

    async analyzeLogsForCompliance(logContent: string, logSource: string): Promise<ComplianceFindingResult[]> {
        try {
            const normalizedLogs = await this.normalizeLogsForAnalysis(logContent, logSource);
            if (!normalizedLogs.success || !normalizedLogs.normalizedEvents) {
                return [];
            }

            const queryMap = new Map<string, any[]>();
        
            this.logger.log(`Normalized logs: ${JSON.stringify(normalizedLogs.normalizedEvents, null, 2)}`);
            for (const event of normalizedLogs.normalizedEvents) {
                const query = this.buildVulnerabilitySearchQuery(event, logSource);
                if (!queryMap.has(query)) {
                    queryMap.set(query, []);
                }
                queryMap.get(query)!.push(event);
            }

            const uniqueQueries = Array.from(queryMap.keys());
            const controlResults = await this.batchProcessorService.processBatch({
                items: uniqueQueries,
                processor: async (query) => {
                    const controls = await this.pineconeService.searchComplianceControls(query, 5);
                    return { query, controls: controls.controls || [] };
                },
                config: {
                    maxConcurrency: 5,
                    batchSize: 20,
                    rateLimitDelay: 1000,
                }
            });

            const allFindings = await this.batchProcessorService.processBatch({
                items: normalizedLogs.normalizedEvents,
                processor: async (event) => {
                    const query = this.buildVulnerabilitySearchQuery(event, logSource);
                    const controlResult = controlResults.success.find(r => r.query === query);
                    const controls = controlResult?.controls || [];
                    
                    return controls
                        .filter(control => control.controlId || control.id)
                        .map(control => ({
                            rule: control.controlId || control.id,
                            description: control.description || control.title || 'Control match found',
                            severity: this.mapSeverity(control?.severity),
                            category: control.category || 'compliance',
                            tags: control?.tags || event?.tags || [],
                            mappedControls: [control.controlId || control.id],
                        }));
                },
                config: {
                    maxConcurrency: 20,
                    batchSize: 100,
                    rateLimitDelay: 0,
                }
            });

            const uniqueFindings = new Map<string, ComplianceFindingResult>();
            for (const batchFindings of allFindings.success) {
                for (const finding of batchFindings) {
                    uniqueFindings.set(finding.rule, finding);
                }
            }

            return Array.from(uniqueFindings.values());
        } catch (error) {
            this.logger.error(`Error analyzing logs for compliance: ${error.message}`);
            return [];
        }
    }

    private async normalizeLogsForAnalysis(
        logContent: string,
        source: string,
    ): Promise<LogNormalizationResult> {
        const prompt = generateNormalizationPrompt();

        try {
            const result = await this.retryService.withRetry({
                execute: async () => {
                    const summary = await this.openaiService.generateCustomSummary(
                        `Log file content: ${logContent}\n\n\n Log source: ${source}`,
                        prompt,
                        {
                          model: 'gpt-4o-mini',
                          temperature: 0.1,
                          maxTokens: 8000,
                        }
                    );

                    const parsedResult = JSON.parse(summary);
                    if (!Array.isArray(parsedResult)) {
                        throw new Error('Response is not an array');
                    }
                    return {
                        success: true,
                        normalizedEvents: parsedResult,
                    };
                },
                maxRetries: 3,
                retryDelay: (retryCount) => Math.min(1000 * 2 ** retryCount, 10000),
            });

            return result;
        } catch (error) {
            this.logger.error(`Error normalizing logs: ${error.message}`);
            return {
                success: false,
                error: 'Failed to normalize logs',
                suggestion: 'Please check the log format and ensure logs are valid'
            };
        }
    }
    
    private buildVulnerabilitySearchQuery(event: NormalizedLogEvent, logSource: string): string {
        const platformContext = {
          aws: 'This log originates from AWS CloudTrail and involves services such as KMS, IAM, S3, or EC2.',
          gcp: 'This log is from GCP Audit Logs and involves services like Cloud Functions, IAM, Storage, or Compute.',
          github: 'This log is generated by GitHub Actions and relates to CI/CD pipelines, webhooks, or secrets.',
        }[logSource] || `This is a log from ${logSource}.`;
      
        const summary = [
          event.contextSummary,
          event.actionCategory ? `This action falls under the category of ${event.actionCategory}.` : '',
          event.riskIndicators?.length ? `It is associated with the following risk indicators: ${event.riskIndicators.join(', ')}.` : '',
          event.tags?.length ? `Relevant tags include: ${event.tags.join(', ')}.` : ''
        ].filter(Boolean).join(' ');
      
        return `${platformContext} ${summary}`.trim();
    }
    
    private mapSeverity(severity: string): SeverityOptions {
        const severityMap = {
            'critical': SeverityOptions.HIGH,
            'high': SeverityOptions.HIGH,
            'medium': SeverityOptions.MEDIUM,
            'low': SeverityOptions.LOW
        };
        return severityMap[severity?.toLowerCase()] || SeverityOptions.MEDIUM;
    }
} 