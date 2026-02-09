
import { BaseMCP } from './BaseMCP';

/**
 * AutomationMCP Server
 * Bridges n8n and Flowise automation platforms.
 */
export class AutomationMCP extends BaseMCP {
    constructor() {
        super('Automation');
    }

    async connect(): Promise<void> {
        // n8n Integration
        this.registerTool({
            name: 'n8n_trigger_workflow',
            description: 'Trigger an n8n workflow via webhook.',
            schema: {
                type: 'object',
                properties: {
                    webhookUrl: { type: 'string', description: 'The n8n webhook URL' },
                    payload: { type: 'object', description: 'Data to send to the workflow' }
                },
                required: ['webhookUrl', 'payload']
            },
            execute: async (args: any) => {
                console.log(`[Automation] 🔗 Triggering n8n workflow: ${args.webhookUrl}`);
                try {
                    const response = await fetch(args.webhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(args.payload)
                    });
                    const result = await response.text();
                    return `n8n Response: ${result}`;
                } catch (e: any) {
                    return `n8n Error: ${e.message}`;
                }
            }
        });

        // Flowise Integration
        this.registerTool({
            name: 'flowise_query',
            description: 'Send a query to a Flowise chat flow.',
            schema: {
                type: 'object',
                properties: {
                    chatflowId: { type: 'string' },
                    question: { type: 'string' },
                    overrideConfig: { type: 'object' }
                },
                required: ['chatflowId', 'question']
            },
            execute: async (args: any) => {
                console.log(`[Automation] 🌊 Querying Flowise: ${args.chatflowId}`);
                const FLOWISE_URL = process.env.FLOWISE_URL || 'http://localhost:3001';
                const FLOWISE_API_KEY = process.env.FLOWISE_API_KEY;
                try {
                    const response = await fetch(`${FLOWISE_URL}/api/v1/prediction/${args.chatflowId}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(FLOWISE_API_KEY ? { 'Authorization': `Bearer ${FLOWISE_API_KEY}` } : {})
                        },
                        body: JSON.stringify({
                            question: args.question,
                            overrideConfig: args.overrideConfig
                        })
                    });
                    if (!response.ok) {
                        return `Flowise Error: ${response.status} ${await response.text()}`;
                    }
                    const result = await response.json();
                    return JSON.stringify(result, null, 2);
                } catch (e: any) {
                    return `Flowise Error: ${e.message}`;
                }
            }
        });

        // Make (Integromat) Integration
        this.registerTool({
            name: 'make_trigger_workflow',
            description: 'Trigger a Make.com (Integromat) scenario via webhook.',
            schema: {
                type: 'object',
                properties: {
                    webhookUrl: { type: 'string', description: 'The Make webhook URL' },
                    payload: { type: 'object', description: 'Data to send to the scenario' }
                },
                required: ['webhookUrl', 'payload']
            },
            execute: async (args: any) => {
                console.log(`[Automation] 🛠️ Triggering Make scenario: ${args.webhookUrl}`);
                try {
                    const response = await fetch(args.webhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(args.payload)
                    });
                    const result = await response.text();
                    return `Make Response: ${result}`;
                } catch (e: any) {
                    return `Make Error: ${e.message}`;
                }
            }
        });

        // SMART REDUNDANCY: Trigger Any
        this.registerTool({
            name: 'trigger_any_workflow',
            description: 'High-redundancy trigger. Tries multiple URLs sequentially until one succeeds.',
            schema: {
                type: 'object',
                properties: {
                    urls: { type: 'array', items: { type: 'string' }, description: 'Ordered list of fallback URLs' },
                    payload: { type: 'object' }
                },
                required: ['urls', 'payload']
            },
            execute: async (args: any) => {
                const results: string[] = [];
                for (const url of args.urls) {
                    console.log(`[Automation] 🛰️ Redundancy Attempt: ${url}`);
                    try {
                        const response = await fetch(url, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(args.payload)
                        });
                        if (response.ok) {
                            const text = await response.text();
                            return `SUCCESS via ${url}: ${text}`;
                        }
                        results.push(`FAIL ${url}: HTTP ${response.status}`);
                    } catch (e: any) {
                        results.push(`FAIL ${url}: ${e.message}`);
                    }
                }
                return `FATAL: All redundancy options failed.\n${results.join('\n')}`;
            }
        });

        this.isConnected = true;
    }
}
