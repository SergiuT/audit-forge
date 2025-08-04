import { Injectable, Logger } from "@nestjs/common";
import { Pinecone } from "@pinecone-database/pinecone";
import { CacheService } from "./cache.service";
import { OpenAIService } from "./openai.service";
import { ConfigService } from "@nestjs/config";
import { AWSSecretManagerService } from "./aws-secret.service";

@Injectable()
export class PineconeService {
  private readonly logger = new Logger(PineconeService.name);
  private pinecone: Pinecone;
  private indexName: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly openaiService: OpenAIService,
    private readonly cacheService: CacheService,
    private readonly awsSecretManagerService: AWSSecretManagerService,
  ) {
    this.indexName = this.configService.get<string>('PINECONE_INDEX_NAME') || 'compliance-agent';
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('PineconeService.onModuleInit: initializing');
    const apiKey = await this.awsSecretManagerService.getSecretWithFallback(
      'pinecone-api-key', 
      'PINECONE_API_KEY'
    );
    
    this.pinecone = new Pinecone({ apiKey });
    this.logger.log('Pinecone initialized with AWS Secret Manager');
  }

  async fetchControlsByIds(controlIds: string[]): Promise<Map<string, any>> {
    if (!this.pinecone) {
      throw new Error('Pinecone is not initialized');
    }

    try {
      const results = new Map<string, any>();

      const index = this.pinecone.index(this.indexName);
      
      await index.query({
        vector: new Array(1536).fill(0),
        filter: { 
          type: 'compliance-control',
          controlId: { $in: controlIds } 
        },
        topK: controlIds.length * 2,
        includeMetadata: true,
      }).then(query => {
        query.matches.forEach(match => {
          if (match.metadata?.controlId) {
            results.set(match.metadata.controlId.toString(), {
              controlId: match.metadata.controlId,
              title: match.metadata.title,
              description: match.metadata.description,
              framework: match.metadata.framework,
            });
          }
        });
      });
      
      return results;
    } catch (error) {
      this.logger.error(`Failed to fetch controls by IDs: ${error.message}`);
      throw error;
    }
  }

  async searchComplianceControls(query: string, topK: number = 3): Promise<{
    query: string;
    totalResults: number;
    controls?: any[];
    message?: string;
    suggestion?: string;
    error?: string;
  }> {
    if (!this.pinecone) {
      throw new Error('Pinecone is not initialized');
    }
    
    const cacheKey = this.cacheService.generateAIKey(query, 'compliance-controls');

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
                        mappedControls: match.metadata?.mappedControls,
                        relevanceScore: match.score?.toFixed(3)
                    }))
                };
            } catch (error) {
                return {
                    error: `Failed to search compliance controls: ${error.message}`,
                    suggestion: 'Ensure Pinecone is properly configured and the knowledge base is loaded',
                    totalResults: 0,
                    query: ''
                };
            }
        },
        100
    );
  }
}