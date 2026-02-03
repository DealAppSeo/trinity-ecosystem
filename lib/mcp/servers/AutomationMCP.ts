
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
                const FLOWISE_URL = process.env.FLOWISE_URL || 'http://localhost:3000';
                try {
                    const response = await fetch(`${FLOWISE_URL}/api/v1/prediction/${args.chatflowId}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            question: args.question,
                            overrideConfig: args.overrideConfig
                        })
                    });
                    const result = await response.json();
                    return JSON.stringify(result, null, 2);
                } catch (e: any) {
                    return `Flowise Error: ${e.message}`;
                }
            }
        });

        this.isConnected = true;
    }
}
