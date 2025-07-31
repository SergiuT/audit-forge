import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAI } from 'openai';
import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const vulnerabilitiesIndex = pinecone.index('compliance-vulnerabilities');
const controlsIndex = pinecone.index('compliance-agent');

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractCPEs(configurations: any): string[] {
  const cpes: string[] = [];
  configurations?.forEach((config: any) => {
    config.nodes?.forEach((node: any) => {
      node.cpeMatch?.forEach((match: any) => {
        if (match.vulnerable && match.criteria) {
          cpes.push(match.criteria);
        }
      });
    });
  });
  return cpes;
}

async function fetchCVECategory(description: string, weaknesses: string[]): Promise<string[]> {
  const prompt = `Extract 2–3 vulnerability categories based on this CVE description and weakness info.
    Description: ${description}
    Weaknesses: ${weaknesses.join(', ')}
    Categories:`;

  const res = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
  });

  const text = res.choices[0].message.content || '';
  return text
    .split(/[\n,]+/)
    .map(x => x.trim().toLowerCase())
    .filter(x => x.length > 2);
}

async function findRelatedControls(embedding: number[]): Promise<string[]> {
  const results = await controlsIndex.query({
    vector: embedding,
    topK: 3,
    filter: { type: 'compliance-control' },
    includeMetadata: true,
  });
  return results.matches?.map(match => match.metadata?.controlId as string).filter((id): id is string => id != null) || [];
}

async function syncNvdToPinecone() {
  let startIndex = 0;
  const pageSize = 100;
  let totalResults = 100000; // override by first response
  let inserted = 0;

  while (startIndex < totalResults) {
    const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?resultsPerPage=${pageSize}&startIndex=${startIndex}`;
    console.log(`📦 Fetching NVD CVEs from ${startIndex}...`);
    try {
      const response = await axios.get(url, {
        headers: { apiKey: process.env.NVD_API_KEY! },
      });

      const data = response.data;
      totalResults = data.totalResults;

      for (const vuln of data.vulnerabilities || []) {
        const item = vuln.cve;
        const cveId = item.id;

        console.log(`🔍 Processing ${cveId}...`);

        // deduplication check
        const exists = await vulnerabilitiesIndex.fetch([cveId]);
        if (exists?.records?.[cveId]) {
            console.log(`⏩ Skipping ${cveId} (already exists)`);
            continue;
        }

        const description = item.descriptions?.find((d: any) => d.lang === 'en')?.value || '';
        const weaknesses = item.weaknesses?.flatMap((w: any) => w.description?.map((d: any) => d.value)) || [];
        const cpes = extractCPEs(item.configurations);
        const severity = item.metrics?.cvssMetricV31?.[0]?.cvssData?.baseSeverity ||
            item.metrics?.cvssMetricV2?.[0]?.baseSeverity || 'UNKNOWN';

        const tags = await fetchCVECategory(description, weaknesses);

        console.log(`🧬 Creating embedding for ${cveId}...`);
        const embeddingText = [
            `CVE ID: ${cveId}`,
            `Description: ${description}`,
            `Weaknesses: ${weaknesses.join(', ')}`,
            `Severity: ${severity}`,
            tags.length > 0 ? `Categories: ${tags.join(', ')}` : '',
            cpes.length > 0 ? `Affected Platforms: ${cpes.join(', ')}` : ''
            ].join('\n');
        const embeddingRes = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: embeddingText,
        });
        const embedding = embeddingRes.data[0].embedding;

        const relatedControls = await findRelatedControls(embedding);
        const cvssScore = item.metrics?.cvssMetricV31?.[0]?.cvssData?.baseScore ||
            item.metrics?.cvssMetricV2?.[0]?.cvssData?.baseScore || null;

        const references = item.references?.map((r: any) => r.url) || [];

        await vulnerabilitiesIndex.upsert([{
          id: cveId,
          values: embedding,
          metadata: {
            type: 'vulnerability',
            cveId,
            description,
            severity,
            ...(typeof cvssScore === 'number' && { cvssScore }),
            weaknesses,
            cpes,
            references,
            categories: tags,
            mappedControls: relatedControls,
            published: item.published,
            lastModified: item.lastModified,
            source: 'nvd',
            embeddingText
          }
        }]);

        inserted++;
        console.log(`✅ Inserted ${cveId} (${inserted} total)`);
        await delay(300);
      }
    } catch (err) {
      console.error(`❌ Failed at startIndex ${startIndex}:`, err.message);
      await delay(10000);
    }

    startIndex += pageSize;
    await delay(1500);
  }

  console.log(`✅ Synced ${inserted} CVEs into Pinecone.`);
}

syncNvdToPinecone().catch(console.error);