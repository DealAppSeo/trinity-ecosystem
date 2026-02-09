import { BaseMCP } from './BaseMCP';
import { MCPTool } from '../types';

/**
 * BraveMCP Server
 * Provides redundant web search capabilities via Brave Search API.
 */
export class BraveMCP extends BaseMCP {
    private apiKey: string;

    constructor() {
        super('BraveSearch');
        this.apiKey = process.env.BRAVE_API_KEY || '';
    }

    async connect(): Promise<void> {
        if (!this.apiKey) {
            console.warn('[BraveSearch] ⚠️ BRAVE_API_KEY missing. Search will be unavailable.');
            return;
        }
        this.isConnected = true;
    }

    async getTools(): Promise<MCPTool[]> {
        return [
            {
                name: 'brave_web_search',
                description: 'Search the web using Brave Search for fresh, independent results.',
                schema: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'The search query' },
                        count: { type: 'number', default: 10, description: 'Number of results to return' }
                    },
                    required: ['query']
                },
                execute: async (args: any) => this.search(args.query, args.count || 10)
            }
        ];
    }

    private async search(query: string, count: number): Promise<string> {
        if (!this.apiKey) return "Error: Brave API key missing.";

        try {
            console.log(`[BraveSearch] 🔎 Searching: ${query}`);
            const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`, {
                headers: {
                    'Accept': 'application/json',
                    'X-Subscription-Token': this.apiKey
                }
            });

            if (!response.ok) {
                return `Brave API Error: ${response.status} ${await response.text()}`;
            }

            const data = await response.json();
            const results = data.web?.results || [];

            if (results.length === 0) return "No results found.";

            let output = `Brave Search Results for "${query}":\n\n`;
            results.forEach((r: any, i: number) => {
                output += `${i + 1}. ${r.title}\n   🔗 ${r.url}\n   📄 ${r.description}\n\n`;
            });

            return output;
        } catch (e: any) {
            return `Brave Search Exception: ${e.message}`;
        }
    }
}
