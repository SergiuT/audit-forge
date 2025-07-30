import { Pinecone } from '@pinecone-database/pinecone';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function setupPinecone() {
    console.log('🔧 Pinecone Index Setup Guide');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📌 RECOMMENDED: Use Pinecone Console for first-time setup');
    console.log('   1. Go to https://app.pinecone.io');
    console.log('   2. Click "Create Index"');
    console.log('   3. Name: compliance-agent');
    console.log('   4. Configuration: text-embedding-3-small (1536 dimensions)');
    console.log('   5. Metric: cosine');
    console.log('   6. Cloud: AWS, Region: us-east-1');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n⚡ Alternatively, this script will create it programmatically...\n');

    const pinecone = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY!,
    });

    const indexName = process.env.PINECONE_INDEX_NAME || 'compliance-agent';

    try {
        console.log(`🚀 Creating Pinecone index: ${indexName}`);

        // Create index for OpenAI text-embedding-3-small
        await pinecone.createIndex({
            name: indexName,
            dimension: 1536,        // text-embedding-3-small dimension
            metric: 'cosine',       // Best for text similarity
            spec: {
                serverless: {
                    cloud: 'aws',
                    region: 'us-east-1'  // Change to your preferred region
                }
            }
        });

        console.log('✅ Pinecone index created successfully!');
        console.log('\n📋 This index is configured for:');
        console.log('   • OpenAI text-embedding-3-small model');
        console.log('   • 1536 dimensions');
        console.log('   • Cosine similarity metric');
        console.log('   • Serverless (pay-per-use) deployment');

        console.log('\n🏷️  Metadata Structure We\'ll Use:');
        console.log('   • type: api-route | compliance-rule | database-schema | business-logic');
        console.log('   • framework: soc2 | iso27001 | hipaa | gdpr (for compliance rules)');
        console.log('   • category: access-control | monitoring | encryption | etc.');
        console.log('   • source: github-integration | aws-integration | manual');
        console.log('   • severity: critical | high | medium | low (for findings)');

        // Wait a moment for index to be ready
        console.log('\n⏳ Waiting for index to be ready...');
        let indexReady = false;
        let attempts = 0;

        while (!indexReady && attempts < 30) {
            try {
                const indexStats = await pinecone.index(indexName).describeIndexStats();
                console.log('📊 Index stats:', indexStats);
                indexReady = true;
                console.log('✅ Index is ready for use!');
            } catch (error) {
                attempts++;
                console.log(`⏳ Attempt ${attempts}/30 - Index not ready yet, waiting 2 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        if (!indexReady) {
            console.log('⚠️  Index creation timed out, but it should be ready soon.');
        }

    } catch (error) {
        if (error.message?.includes('already exists')) {
            console.log('✅ Index already exists, checking if it\'s ready...');

            try {
                const indexStats = await pinecone.index(indexName).describeIndexStats();
                console.log('📊 Existing index stats:', indexStats);
                console.log('✅ Index is ready for use!');
            } catch (statsError) {
                console.log('⚠️  Index exists but may not be ready yet. Try again in a minute.');
            }
        } else {
            console.error('❌ Error creating index:', error.message);
            console.log('\n💡 TIP: If you see permission errors, try creating the index');
            console.log('   manually in the Pinecone console first.');
            throw error;
        }
    }
}

if (require.main === module) {
    setupPinecone().catch(console.error);
}

export { setupPinecone };