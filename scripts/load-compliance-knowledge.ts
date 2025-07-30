import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAI } from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import csv from 'csv-parser';
import * as dotenv from 'dotenv';

dotenv.config();

interface VantaControl {
    frameworkRequirement: string;
    frameworkCode: string;
    title: string;
    id: string;
    uid: string;
    url: string;
    description: string;
    descriptionModified: string;
    evidenceStatus: string;
    domain: string;
    owner: string;
    variants?: string;
}

interface KnowledgeBaseEntry {
    id: string;
    type: 'compliance-control';
    framework: string;
    controlId: string;
    title: string;
    description: string;
    domain: string;
    evidenceStatus: string;
    owner: string;
    metadata: {
        frameworkCode: string;
        uid: string;
        url: string;
        source: 'vanta';
        lastUpdated: string;
        mappedControls?: string[];
    };
}

class ComplianceKnowledgeLoader {
    private pinecone: Pinecone;
    private openai: OpenAI;
    private indexName: string;

    constructor() {
        this.pinecone = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY!,
        });

        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY!,
        });

        this.indexName = process.env.PINECONE_INDEX_NAME || 'compliance-agent';
    }

    async loadComplianceControls() {
        console.log('🚀 Loading compliance controls from Vanta CSVs...');

        const frameworks = [
            { file: 'SOC2_controls.csv', framework: 'soc2' },
            { file: 'ISO27001_2022_controls.csv', framework: 'iso27001' },
            { file: 'DORA_controls.csv', framework: 'dora' }
        ];

        const index = this.pinecone.index(this.indexName);
        let totalLoaded = 0;

        for (const { file, framework } of frameworks) {
            console.log(`📄 Processing ${file}...`);

            const controls = await this.readCSV(file);
            const knowledgeEntries = this.convertToKnowledgeBase(controls, framework);

            console.log(`   Found ${knowledgeEntries.length} controls`);

            // Process in batches of 100 for efficiency
            const batchSize = 100;
            for (let i = 0; i < knowledgeEntries.length; i += batchSize) {
                const batch = knowledgeEntries.slice(i, i + batchSize);
                const vectors = await this.createVectors(batch);

                await index.upsert(vectors);
                console.log(`   ✅ Loaded batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(knowledgeEntries.length / batchSize)}`);

                // Rate limiting - wait between batches
                await this.delay(1000);
            }

            totalLoaded += knowledgeEntries.length;
            console.log(`✅ Completed ${framework.toUpperCase()}: ${knowledgeEntries.length} controls\n`);
        }

        console.log(`🎉 Successfully loaded ${totalLoaded} compliance controls!`);
        return totalLoaded;
    }

    private async readCSV(filename: string): Promise<VantaControl[]> {
        return new Promise((resolve, reject) => {
            const controls: VantaControl[] = [];
            const filePath = path.join(process.cwd(), filename);

            fs.createReadStream(filePath)
                .pipe(csv({
                    mapHeaders: ({ header }) => {
                        // Map CSV headers to our interface
                        const headerMap: Record<string, string> = {
                            'Framework requirement': 'frameworkRequirement',
                            'Framework code': 'frameworkCode',
                            'Title': 'title',
                            'ID': 'id',
                            'UID': 'uid',
                            'Url': 'url',
                            'Description': 'description',
                            'Description modified?': 'descriptionModified',
                            'Evidence status': 'evidenceStatus',
                            'Domain': 'domain',
                            'Owner': 'owner',
                            'Variants': 'variants'
                        };
                        return headerMap[header] || header;
                    }
                }))
                .on('data', (data: VantaControl) => {
                    controls.push(data);
                })
                .on('end', () => {
                    resolve(controls);
                })
                .on('error', (error) => {
                    reject(error);
                });
        });
    }

    private convertToKnowledgeBase(controls: VantaControl[], framework: string): KnowledgeBaseEntry[] {
        return controls.map(control => {
            // Extract cross-framework mappings from frameworkCode
            const mappedControls = control.frameworkCode
                .split(',')
                .map(code => code.trim())
                .filter(code => code !== control.frameworkRequirement);

            return {
                id: `${framework}-${control.uid}`,
                type: 'compliance-control',
                framework,
                controlId: control.frameworkRequirement,
                title: control.title,
                description: control.description,
                domain: control.domain,
                evidenceStatus: control.evidenceStatus,
                owner: control.owner,
                metadata: {
                    frameworkCode: control.frameworkCode,
                    uid: control.uid,
                    url: control.url,
                    source: 'vanta',
                    lastUpdated: new Date().toISOString(),
                    mappedControls: mappedControls.length > 0 ? mappedControls : undefined
                }
            };
        });
    }

    private async createVectors(entries: KnowledgeBaseEntry[]): Promise<any[]> {
        const vectors: any[] = [];

        for (const entry of entries) {
            // Create rich text for embedding that includes all searchable content
            const embeddingText = [
                `Framework: ${entry.framework.toUpperCase()}`,
                `Control: ${entry.controlId}`,
                `Title: ${entry.title}`,
                `Domain: ${entry.domain}`,
                `Description: ${entry.description}`,
                entry.metadata.mappedControls ? `Related Controls: ${entry.metadata.mappedControls.join(', ')}` : ''
            ].filter(Boolean).join('\n');

            // Generate embedding
            const embeddingResponse = await this.openai.embeddings.create({
                model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
                input: embeddingText,
            });

            vectors.push({
                id: entry.id,
                values: embeddingResponse.data[0].embedding,
                metadata: {
                    type: entry.type,
                    framework: entry.framework,
                    controlId: entry.controlId,
                    title: entry.title,
                    description: entry.description,
                    domain: entry.domain,
                    evidenceStatus: entry.evidenceStatus,
                    owner: entry.owner,
                    frameworkCode: entry.metadata.frameworkCode,
                    uid: entry.metadata.uid,
                    url: entry.metadata.url,
                    source: entry.metadata.source,
                    lastUpdated: entry.metadata.lastUpdated,
                    mappedControls: entry.metadata.mappedControls || [],
                    // Full searchable text for reference
                    embeddingText
                }
            });
        }

        return vectors;
    }

    private async delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Utility method to search the knowledge base
    async searchControls(query: string, framework?: string, topK: number = 10) {
        const index = this.pinecone.index(this.indexName);

        // Generate query embedding
        const queryEmbedding = await this.openai.embeddings.create({
            model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
            input: query,
        });

        // Build filter
        const filter: any = { type: 'compliance-control' };
        if (framework) {
            filter.framework = framework;
        }

        // Search
        const searchResults = await index.query({
            vector: queryEmbedding.data[0].embedding,
            filter,
            topK,
            includeMetadata: true,
        });

        return searchResults.matches?.map(match => ({
            score: match.score,
            control: {
                id: match.metadata?.controlId,
                framework: match.metadata?.framework,
                title: match.metadata?.title,
                description: match.metadata?.description,
                domain: match.metadata?.domain,
                evidenceStatus: match.metadata?.evidenceStatus,
                mappedControls: match.metadata?.mappedControls || [],
                url: match.metadata?.url
            }
        })) || [];
    }
}

// CLI interface
async function main() {
    const loader = new ComplianceKnowledgeLoader();

    const command = process.argv[2];

    if (command === 'load') {
        try {
            await loader.loadComplianceControls();
        } catch (error) {
            console.error('❌ Error loading compliance controls:', error);
            process.exit(1);
        }
    } else if (command === 'search') {
        const query = process.argv[3];
        const framework = process.argv[4];

        if (!query) {
            console.log('Usage: npm run knowledge:search "query" [framework]');
            process.exit(1);
        }

        try {
            const results = await loader.searchControls(query, framework);
            console.log(`🔍 Search results for: "${query}"`);
            console.log(`Found ${results.length} controls:\n`);

            results.forEach((result, index) => {
                console.log(`${index + 1}. [${(result.control.framework as string)?.toUpperCase() || 'UNKNOWN'}] ${result.control.id}: ${result.control.title}`);
                console.log(`   Score: ${result.score?.toFixed(3)}`);
                console.log(`   Domain: ${result.control.domain}`);
                console.log(`   Description: ${((result.control.description as string)?.substring(0, 200) || '')}...`);
                const mappedControls = result.control.mappedControls as string[] || [];
                if (mappedControls.length > 0) {
                    console.log(`   Related: ${mappedControls.join(', ')}`);
                }
                console.log('');
            });
        } catch (error) {
            console.error('❌ Error searching controls:', error);
            process.exit(1);
        }
    } else {
        console.log('Usage:');
        console.log('  npm run knowledge:load          - Load all compliance controls');
        console.log('  npm run knowledge:search "query" [framework] - Search controls');
        console.log('');
        console.log('Examples:');
        console.log('  npm run knowledge:search "access control"');
        console.log('  npm run knowledge:search "incident response" soc2');
        console.log('  npm run knowledge:search "encryption" iso27001');
    }
}

if (require.main === module) {
    main().catch(console.error);
}

export { ComplianceKnowledgeLoader }; 