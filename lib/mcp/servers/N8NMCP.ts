
import { BaseMCP } from './BaseMCP';
import { MCPTool } from '../types';

/**
 * [RESOURCEFUL] N8NMCP
 * The bridge between Trinity's reasoning and n8n's automation muscle.
 * Enables triggering complex workflows and discovering automation capabilities.
 */
export class N8NMCP extends BaseMCP {
    private apiKey: string;
    private baseUrl: string;

    constructor() {
        super('n8n');
        this.apiKey = process.env.N8N_API_KEY || '';
        this.baseUrl = process.env.N8N_BASE_URL || 'http://localhost:5678';
    }

    async connect(): Promise<void> {
        if (!this.apiKey) {
            console.warn('[n8n] ⚠️ N8N_API_KEY missing. Only webhook triggering will be available.');
        }
        this.isConnected = true;
    }

    private setupTools() {
        this.registerTool({
            name: 'n8n_trigger_webhook',
            description: 'Trigger an n8n workflow via its webhook URL.',
            schema: {
                type: 'object',
                properties: {
                    webhookId: { type: 'string', description: 'The unique ID or path segment of the n8n webhook' },
                    data: { type: 'object', description: 'JSON payload to send to the workflow' },
                    isTest: { type: 'boolean', default: false, description: 'Use /webhook-test instead of /webhook' }
                },
                required: ['webhookId', 'data']
            },
            execute: async (args: any) => this.triggerWebhook(args.webhookId, args.data, args.isTest)
        });

        this.registerTool({
            name: 'n8n_list_workflows',
            description: 'List available workflows in n8n (Requires N8N_API_KEY).',
            schema: {
                type: 'object',
                properties: {
                    activeOnly: { type: 'boolean', default: true }
                }
            },
            execute: async (args: any) => this.listWorkflows(args.activeOnly)
        });

        this.registerTool({
            name: 'n8n_get_execution',
            description: 'Check the status of a specific workflow execution (Requires N8N_API_KEY).',
            schema: {
                type: 'object',
                properties: {
                    executionId: { type: 'string', description: 'The ID of the execution to check' }
                },
                required: ['executionId']
            },
            execute: async (args: any) => this.getExecution(args.executionId)
        });
    }

    async initialize(): Promise<void> {
        await super.initialize();
        this.setupTools();
    }

    private async triggerWebhook(id: string, data: any, isTest: boolean): Promise<string> {
        const type = isTest ? 'webhook-test' : 'webhook';
        const url = `${this.baseUrl}/${type}/${id}`;

        console.log(`[n8n] 📡 Triggering workflow ${id} (${type})...`);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.text();
            if (!response.ok) return `n8n Webhook Error (${response.status}): ${result}`;

            return `n8n Webhook Success: ${result || 'Workflow started'}`;
        } catch (e: any) {
            return `n8n Connection Failed: ${e.message}`;
        }
    }

    private async listWorkflows(activeOnly: boolean): Promise<string> {
        if (!this.apiKey) return "Error: N8N_API_KEY required for discovery tools.";

        try {
            const response = await fetch(`${this.baseUrl}/api/v1/workflows?active=${activeOnly}`, {
                headers: { 'X-N8N-API-KEY': this.apiKey }
            });
            const data = await response.json();
            if (data.error) throw new Error(data.error);

            return JSON.stringify(data.data.map((w: any) => ({
                id: w.id,
                name: w.name,
                active: w.active
            })), null, 2);
        } catch (e: any) {
            return `n8n API Error: ${e.message}`;
        }
    }

    private async getExecution(id: string): Promise<string> {
        if (!this.apiKey) return "Error: N8N_API_KEY required for execution monitoring.";

        try {
            const response = await fetch(`${this.baseUrl}/api/v1/executions/${id}`, {
                headers: { 'X-N8N-API-KEY': this.apiKey }
            });
            const data = await response.json();
            return JSON.stringify(data, null, 2);
        } catch (e: any) {
            return `n8n API Error: ${e.message}`;
        }
    }
}
