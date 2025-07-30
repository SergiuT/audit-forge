import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAI } from 'openai';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

async function loadComplianceKnowledge() {
    console.log('🚀 Loading compliance knowledge from Vanta CSVs...');

    const pinecone = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY!,
    });

    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY!,
    });

    const indexName = process.env.PINECONE_INDEX_NAME || 'compliance-agent';
    const index = pinecone.index(indexName);

    // Real controls from SOC2_controls.csv for testing
    const sampleControls = [
        {
            id: 'code-of-conduct-acknowledged-contractors',
            framework: 'SOC2',
            controlId: 'CC 1.1',
            title: 'Code of Conduct acknowledged by contractors',
            description: 'The company requires contractor agreements to include a code of conduct or reference to the company code of conduct.',
            domain: 'HUMAN_RESOURCES_SECURITY',
            type: 'compliance-control',
            uid: 'code-of-conduct-acknowledged-contractors',
            evidenceStatus: 'OK',
            owner: 'adrian@moonlet.io'
        },
        {
            id: 'code-of-conduct-acknowledged-employees',
            framework: 'SOC2',
            controlId: 'CC 1.1, CC 1.5',
            title: 'Code of Conduct acknowledged by employees and enforced',
            description: 'The company requires employees to acknowledge a code of conduct at the time of hire. Employees who violate the code of conduct are subject to disciplinary actions in accordance with a disciplinary policy.',
            domain: 'HUMAN_RESOURCES_SECURITY',
            type: 'compliance-control',
            uid: 'code-of-conduct-acknowledged-employees',
            evidenceStatus: 'OK',
            owner: 'adrian@moonlet.io'
        }
    ];

    console.log('📝 Creating embeddings for real SOC2 controls...');

    const vectors: any[] = [];

    for (const control of sampleControls) {
        const embeddingText = `Framework: ${control.framework}\nControl: ${control.controlId}\nTitle: ${control.title}\nDomain: ${control.domain}\nDescription: ${control.description}`;

        const embeddingResponse = await openai.embeddings.create({
            model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
            input: embeddingText,
        });

        vectors.push({
            id: control.id,
            values: embeddingResponse.data[0].embedding,
            metadata: {
                ...control,
                embeddingText
            }
        });

        console.log(`   ✅ Created embedding for ${control.framework} ${control.controlId}: ${control.title}`);
    }

    console.log('💾 Uploading vectors to Pinecone...');
    await index.upsert(vectors);

    console.log(`🎉 Successfully loaded ${vectors.length} real SOC2 compliance controls!`);
    console.log('');
    console.log('🧪 Testing vector search...');

    // Test search
    const queryEmbedding = await openai.embeddings.create({
        model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
        input: 'code of conduct employee requirements',
    });

    const searchResults = await index.query({
        vector: queryEmbedding.data[0].embedding,
        filter: { type: 'compliance-control' },
        topK: 2,
        includeMetadata: true,
    });

    console.log('🔍 Search results for "code of conduct employee requirements":');
    searchResults.matches?.forEach((match, i) => {
        console.log(`${i + 1}. ${match.metadata?.framework} ${match.metadata?.controlId}: ${match.metadata?.title}`);
        console.log(`   Score: ${match.score?.toFixed(3)}`);
    });

    return vectors.length;
}

if (require.main === module) {
    loadComplianceKnowledge().catch(console.error);
}

export { loadComplianceKnowledge }; 