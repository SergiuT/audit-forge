import { AgentFunction } from "../types/types";

export const agentFunctions: AgentFunction[] = [
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
    },
    {
        name: 'analyze_logs_for_compliance',
        description: 'Analyze AWS/GCP/GitHub logs for compliance violations using AI and vector search',
        parameters: {
          type: 'object',
          properties: {
            logContent: {
              type: 'string',
              description: 'The log content to analyze (max 8000 characters)'
            },
            logType: {
              type: 'string',
              enum: ['aws', 'gcp', 'github'],
              description: 'Type of logs being analyzed'
            },
            frameworks: {
              type: 'array',
              items: { type: 'string', enum: ['SOC2', 'ISO27001', 'DORA', 'NVD'] },
              description: 'Compliance frameworks to check against'
            }
          },
          required: ['logContent', 'logType', 'frameworks']
        }
    }
];

export const generateNormalizationPrompt = () => `
    You are a senior AI security assistant inside a compliance platform.

    Your task is to normalize raw cloud logs from AWS, GCP, or GitHub. Extract only key information needed to match logs to vulnerabilities and compliance controls.

    Return a JSON **array** of normalized events. Each object must follow this format:

    {
        "eventName": string,            // e.g. GenerateDataKey, DeleteUser, push
        "eventSource": string,          // e.g. kms.amazonaws.com, iam.amazonaws.com
        "actor": string,                // user or service that triggered the action
        "service": string,              // Logical service (kms, iam, github, gcs, etc.)
        "resource": string | null,      // The affected resource (e.g. key ARN, bucket, repo)
        "tags": string[],               // Security-relevant keywords like: "KMS usage", "privileged access", "role assumption", "log decryption", etc.
        "controlContext": string,       // Compliance-relevant interpretation of this event's purpose or risk. Use phrases like "privileged access without MFA", "unauthorized secret decryption", "root user usage", etc.
        "actionCategory": string,       // High-level category: e.g. access control, data encryption
        "riskIndicators": string[],     // Relevant tags like ["destructive action", "privileged access"]
        "contextSummary": string        // Human-readable summary of the action
    }

    Instructions:
    - Include ALL fields for each object. Do NOT skip nulls.
    - Focus on semantic meaning: what happened, who did it, why it matters.
    - Detect sensitive actions like key generation, deletions, role changes, pushes, etc.
    - Extract fields from AWS CloudTrail, GCP Audit Logs, and GitHub Events (workflow_job, push, etc.).
    - DO NOT return markdown, explanation, or extra text. Only return the JSON array.
    - You must return a normalized object for every log event, even if the content is redundant.

    -----
    ### 🧭 Example Transformations

    **1. AWS - CloudTrail:**

    Input:
    - \`eventName\`: "GenerateDataKey"
    - \`eventSource\`: "kms.amazonaws.com"
    - \`userIdentity\`: cloudtrail.amazonaws.com

    Normalized output:
    \`\`\`json
    {
        "eventName": "GenerateDataKey",
        "eventSource": "kms.amazonaws.com",
        "actor": "cloudtrail.amazonaws.com",
        "service": "kms",
        "resource": "arn:aws:kms:eu-central-1:...key/xxx",
        "actionCategory": "key management",
        "riskIndicators": ["KMS usage", "automated log encryption"],
        "contextSummary": "CloudTrail triggered a KMS key generation to encrypt logs in region eu-central-1."
    }
    \`\`\`

    **2. GitHub Push:**

    Input:
    - \`event\`: push
    - \`pusher\`: johndoe
    - \`repository\`: auditforge-compliance

    Normalized output:
    \`\`\`json
    {
        "eventName": "push",
        "eventSource": "github.com",
        "actor": "johndoe",
        "service": "github",
        "resource": "auditforge-compliance",
        "actionCategory": "code change",
        "riskIndicators": ["repo push", "production branch change"],
        "contextSummary": "User johndoe pushed code to repository auditforge-compliance."
    }
    \`\`\`
`;