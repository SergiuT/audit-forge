import { Injectable, Logger } from '@nestjs/common';
import { OpenAIService } from '@/shared/services/openai.service';
import { User } from '../auth/entities/user.entity';
import { agentFunctions, generateNormalizationPrompt } from '@/shared/utils/ai-agent.util';
import { ComplianceFindingResult, LogNormalizationResult, NormalizedLogEvent, SeverityOptions } from '@/shared/types/types';
import { PineconeService } from '@/shared/services/pinecone.service';

@Injectable()
export class AIAgentService {
    private readonly logger = new Logger(AIAgentService.name);

    constructor(
        private readonly openaiService: OpenAIService,
        private readonly pineconeService: PineconeService,
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

            const uniqueQueries = new Set<string>();
        
            for (const event of normalizedLogs.normalizedEvents) {
                const query = this.buildVulnerabilitySearchQuery(event, logSource);
                uniqueQueries.add(query);
            }
            
            const controlResults = await this.batchSearchControls(Array.from(uniqueQueries));

            const findings: ComplianceFindingResult[] = [];
            const seenRules = new Set<string>();
            
            for (const event of normalizedLogs.normalizedEvents) {
                const query = this.buildVulnerabilitySearchQuery(event, logSource);
                const controls = controlResults.get(query) || [];
                
                for (const control of controls) {
                    const ruleId = control.controlId || control.id;
                    
                    if (ruleId && !seenRules.has(ruleId)) {
                        seenRules.add(ruleId);
                        
                        findings.push({
                            rule: ruleId,
                            description: control.description || control.title || 'Control match found',
                            severity: this.mapSeverity(control?.severity),
                            category: control.category || 'compliance',
                            tags: control?.tags || event?.tags || [],
                            mappedControls: [ruleId],
                        });
                    }
                }
            }
            
            return findings;
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

        let attempts = 0;
        const maxAttempts = 3;
            
        while (attempts < maxAttempts) {
            try {
                const result = await this.openaiService.generateCustomSummary(
                    `Log file content: ${logContent}\n\n\n Log source: ${source}\n\n\n
                    ${attempts > 0 && 'Please normalize the log content into a JSON array of objects, the first attempt failed, you returned an incomplete array structure'}
                    `,
                    prompt,
                    {
                        model: 'gpt-4o-mini',
                        temperature: 0.1,
                        attempts,
                        maxTokens: 8000
                    }
                );

                // Try to parse the JSON
                const parsedResult = JSON.parse(result);
                
                // Validate that it's an array
                if (Array.isArray(parsedResult)) {
                    return {
                        success: true,
                        normalizedEvents: parsedResult,
                    };
                } else {
                    attempts++;
                    throw new Error('Response is not an array');
                }
            } catch (parseError) {
                attempts++;
                this.logger.warn(`JSON parsing attempt ${attempts} failed: ${parseError.message}`);
                
                if (attempts >= maxAttempts) {
                    throw new Error(`Failed to parse JSON after ${maxAttempts} attempts: ${parseError.message}`);
                }
                
                // Wait a bit before retrying
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        return {
            success: false,
            error: 'Failed to parse JSON',
            suggestion: 'Check log format and ensure logs are valid'
        };
    }

    private async batchSearchControls(queries: string[]): Promise<Map<string, any[]>> {
        const results = new Map<string, any[]>();
        
        // Process in parallel with error handling
        const searchPromises = queries.map(async (query) => {
            try {
                const result = await this.pineconeService.searchComplianceControls(query, 5);
                return { query, result: result.controls || [] };
            } catch (error) {
                this.logger.warn(`Failed to search controls for query: ${query}`, error);
                return { query, result: [] };
            }
        });
        
        const searchResults = await Promise.allSettled(searchPromises);
        
        searchResults.forEach((result) => {
            if (result.status === 'fulfilled') {
                results.set(result.value.query, result.value.result);
            }
        });
        
        return results;
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