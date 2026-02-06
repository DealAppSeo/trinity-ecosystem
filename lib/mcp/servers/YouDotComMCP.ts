import { BaseMCP } from './BaseMCP';
import { MCPTool } from '../types';

/**
 * YouDotComMCP Server
 * Provides agents with access to You.com's AI-powered search and research capabilities.
 */
export class YouDotComMCP extends BaseMCP {
    private apiKey: string;
    private endpoint: string = 'https://api.ydc-index.io/search';

    constructor() {
        super('YouDotCom');
        this.apiKey = process.env.YOU_API_KEY || '';
    }

    async connect(): Promise<void> {
        if (!this.apiKey) {
            console.warn('[YouDotComMCP] YOU_API_KEY is missing.');
            return;
        }
        this.isConnected = true;
    }

    async getTools(): Promise<MCPTool[]> {
        return [
            {
                name: 'you_search',
                description: 'Search the web using You.com AI index for high-quality, cited results.',
                schema: {
                    type: 'object',
                    properties: {
                        query: { type: 'string' },
                        num_outputs: { type: 'number', default: 3 }
                    },
                    required: ['query']
                },
                execute: async (args: any) => this.callTool('you_search', args)
            }
        ];
    }

    async callTool(toolName: string, args: any): Promise<string> {
        if (!this.isConnected) return "You.com API not connected. Check YOU_API_KEY.";

        if (toolName === 'you_search') {
            try {
                const response = await fetch(`${this.endpoint}?query=${encodeURIComponent(args.query)}`, {
                    headers: { 'X-API-Key': this.apiKey }
                });
                const data = await response.json();
                return JSON.stringify(data, null, 2);
            } catch (e: any) {
                return `You.com Error: ${e.message}`;
            }
        }

        throw new Error(`Tool ${toolName} not supported.`);
    }
}
