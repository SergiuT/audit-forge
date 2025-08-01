import { Injectable, Logger } from '@nestjs/common';
import { OpenAIService } from '@/shared/services/openai.service';
import { GithubScanService } from '@/modules/integrations/services/github-scan.service';
import { Pinecone } from '@pinecone-database/pinecone';
import { ConfigService } from '@nestjs/config';
import { API_ROUTES_KNOWLEDGE } from '@/knowledge/api-routes';
import { CacheService } from '@/shared/services/cache.service';

interface AgentFunction {
    name: string;
    description: string;
    parameters: any;
}

@Injectable()
export class AIAgentService {
    private readonly logger = new Logger(AIAgentService.name);
    private pinecone: Pinecone;
    private indexName: string;

    // Define the functions/tools our agent can use
    private readonly functions: AgentFunction[] = [
        {
            name: 'scan_github_compliance',
            description: 'Scan GitHub repositories for SOC2 and ISO27001 compliance issues',
            parameters: {
                type: 'object',
                properties: {
                    projectId: {
                        type: 'string',
                        description: 'The project ID to scan'
                    },
                    repos: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Specific repositories to scan (empty array scans all repos)'
                    }
                },
                required: ['projectId', 'repos']
            }
        },
        {
            name: 'search_compliance_controls',
            description: 'Search for specific compliance controls across SOC2, ISO27001, and DORA frameworks',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'The search query (e.g., "access control", "incident response", "encryption")'
                    },
                    topK: {
                        type: 'number',
                        description: 'Number of results to return (default: 3)'
                    }
                },
                required: ['query']
            }
        },
        {
            name: 'get_api_route_info',
            description: 'Get information about available API routes for compliance operations',
            parameters: {
                type: 'object',
                properties: {
                    operation: {
                        type: 'string',
                        description: 'Specific operation (e.g., "scan", "report", "export", "findings")'
                    }
                }
            }
        }
    ];

    constructor(
        private readonly openaiService: OpenAIService,
        private readonly githubScanService: GithubScanService,
        private readonly configService: ConfigService,
        private readonly cacheService: CacheService,
    ) {
        this.pinecone = new Pinecone({
            apiKey: this.configService.get<string>('PINECONE_API_KEY')!,
        });
        this.indexName = this.configService.get<string>('PINECONE_INDEX_NAME') || 'compliance-agent';
    }

    async processMessage(message: string, context: { projectId?: string; userId?: string } = {}): Promise<string> {
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
                this.functions,
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
                    this.functions,
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

    private async executeFunction(name: string, args: any, context: { projectId?: string; userId?: string }): Promise<any> {
        switch (name) {
            case 'scan_github_compliance':
                return this.scanGitHubCompliance(args.projectId, args.repos, context);

            case 'search_compliance_controls':
                return this.searchComplianceControls(args.query, args.topK);

            case 'get_api_route_info':
                return this.getApiRouteInfo(args.operation);

            default:
                throw new Error(`Unknown function: ${name}`);
        }
    }

    private async scanGitHubCompliance(projectId: string, repos: string[], context: { userId?: string }): Promise<any> {
        try {
            const userId = context?.userId;
            
            if (!userId) {
                throw new Error('User ID is required for GitHub scanning');
            }

            await this.githubScanService.scanGitHubIntegrationProjects(projectId, repos, userId);

            return {
                success: true,
                message: `GitHub compliance scan initiated for project ${projectId}`,
                repositories: repos.length > 0 ? repos : 'all repositories',
                nextSteps: [
                    'Scan results will be processed and stored as compliance findings',
                    'Check the compliance reports for detailed analysis',
                    'Use GET /compliance/project/{projectId}/reports to view results'
                ]
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                suggestion: 'Please ensure the project has GitHub integration configured'
            };
        }
    }

    private async searchComplianceControls(query: string, topK: number = 3): Promise<any> {
        const cacheKey = `pinecone_search:${query}:${topK}`;
    
        return this.cacheService.getOrSet(
            cacheKey,
            async () => {
                try {
                    const index = this.pinecone.index(this.indexName);

                    // Generate query embedding
                    const queryEmbedding = await this.openaiService.getEmbedding(query);

                    // Search the vector database
                    const searchResults = await index.query({
                        vector: queryEmbedding,
                        filter: { type: 'compliance-control' },
                        topK,
                        includeMetadata: true,
                    });

                    if (!searchResults.matches || searchResults.matches.length === 0) {
                        return {
                            query,
                            totalResults: 0,
                            message: 'No compliance controls found. The knowledge base may need to be loaded.',
                            suggestion: 'Try running: npx ts-node scripts/simple-load-knowledge.ts'
                        };
                    }

                    return {
                        query,
                        totalResults: searchResults.matches.length,
                        controls: searchResults.matches.map(match => ({
                            controlId: match.metadata?.controlId,
                            framework: match.metadata?.framework,
                            title: match.metadata?.title,
                            description: match.metadata?.description,
                            domain: match.metadata?.domain,
                            relevanceScore: match.score?.toFixed(3)
                        }))
                    };
                } catch (error) {
                    return {
                        error: `Failed to search compliance controls: ${error.message}`,
                        suggestion: 'Ensure Pinecone is properly configured and the knowledge base is loaded'
                    };
                }
            },
            3600 // Cache for 1 hour
        );
    }

    private getApiRouteInfo(operation?: string): any {
        if (operation) {
            // Search for specific operation in API routes
            const relevantRoutes = API_ROUTES_KNOWLEDGE
                .split('\n')
                .filter(line => line.toLowerCase().includes(operation.toLowerCase()))
                .slice(0, 10);

            return {
                operation,
                relevantRoutes: relevantRoutes.length > 0 ? relevantRoutes : ['No specific routes found for this operation'],
                note: 'Use GET, POST, DELETE operations as needed'
            };
        }

        return {
            totalRoutes: 39,
            categories: [
                'Health & System Monitoring',
                'Authentication',
                'Compliance Management',
                'Findings Analysis',
                'Integration Management',
                'Project Management',
                'Checklist Management',
                'Audit Trail',
                'AI Agent System'
            ],
            authenticationRequired: 'JWT Bearer token for most routes',
            baseUrl: 'All routes are relative to your API base URL'
        };
    }
} 