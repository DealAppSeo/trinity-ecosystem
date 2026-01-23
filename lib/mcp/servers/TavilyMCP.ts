import { MCPServer, MCPTool } from '../types';

export class TavilyMCP implements MCPServer {
    name = 'TavilySearch';
    private apiKey: string | undefined;

    constructor() {
        this.apiKey = process.env.TAVILY_API_KEY;
    }

    async initialize(): Promise<void> {
        if (!this.apiKey) {
            console.warn('[TavilyMCP] ⚠️ No API Key found. Search will fail.');
        } else {
            console.log('[TavilyMCP] 🚀 Initialized with API Key.');
        }
    }

    async healthCheck(): Promise<boolean> {
        return !!this.apiKey;
    }

    async getTools(): Promise<MCPTool[]> {
        return [
            {
                name: 'search_web',
                description: 'Expert-grade web search. Returns deep research results, AI answers, and source links. Arguments: query (string), depth (basic|advanced), include_images (boolean).',
                schema: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'The search query' },
                        depth: { type: 'string', enum: ['basic', 'advanced'], description: 'Advanced depth for deep research' },
                        include_images: { type: 'boolean', description: 'If true, returns relevant image links' }
                    },
                    required: ['query']
                },
                execute: async (args: any) => this.search(args.query, args.depth || 'advanced', args.include_images || false)
            }
        ];
    }

    async callTool(toolName: string, args: any): Promise<string> {
        if (toolName === 'search_web') {
            return this.search(args.query, args.depth || 'advanced', args.include_images || false);
        }
        throw new Error(`Tool ${toolName} not found`);
    }

    private async search(query: string, depth: string = 'advanced', includeImages: boolean = false): Promise<string> {
        if (!this.apiKey) return "Error: No TAVILY_API_KEY configured. Please add it to .env.local.";

        try {
            console.log(`[TavilyExpert] 🔎 Deep Search: "${query}" (Depth: ${depth})`);
            const response = await fetch('https://api.tavily.com/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_key: this.apiKey,
                    query: query,
                    search_depth: depth,
                    include_answer: true, // Always helpful for agents
                    include_images: includeImages,
                    max_results: 8 // Expert grade density
                })
            });

            if (!response.ok) {
                const err = await response.text();
                return `Error from Tavily: ${response.status} ${err}`;
            }

            const data = await response.json();

            let result = "";
            if (data.answer) {
                result += `[EXPERT SUMMARY]: ${data.answer}\n\n`;
            }

            if (data.results && Array.isArray(data.results)) {
                result += "[PRIMARY SOURCES]:\n";
                data.results.forEach((r: any, i: number) => {
                    result += `${i + 1}. ${r.title}\n   🔗 URL: ${r.url}\n   📝 CONTENT: "${r.content.substring(0, 300)}..."\n\n`;
                });
            }

            if (data.images && data.images.length > 0) {
                result += "[VISUAL ASSETS]:\n";
                data.images.slice(0, 3).forEach((img: any) => result += `📸 ${img}\n`);
            }

            return result;

        } catch (error: any) {
            return `Search exception: ${error.message}`;
        }
    }
}
