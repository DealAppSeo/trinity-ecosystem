"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TavilyMCP = void 0;
class TavilyMCP {
    constructor() {
        this.name = 'TavilySearch';
        this.apiKey = process.env.TAVILY_API_KEY;
    }
    async initialize() {
        if (!this.apiKey) {
            console.warn('[TavilyMCP] ⚠️ No API Key found. Search will fail.');
        }
        else {
            console.log('[TavilyMCP] 🚀 Initialized with API Key.');
        }
    }
    async healthCheck() {
        return !!this.apiKey;
    }
    async getTools() {
        return [
            {
                name: 'search_web',
                description: 'Search the live internet for up-to-date information. Arguments: query (string), include_answer (boolean).',
                schema: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'The search query' },
                        include_answer: { type: 'boolean', description: 'If true, returns a short AI-generated answer' }
                    },
                    required: ['query']
                },
                execute: async (args) => this.search(args.query, args.include_answer)
            }
        ];
    }
    async callTool(toolName, args) {
        if (toolName === 'search_web') {
            return this.search(args.query, args.include_answer);
        }
        throw new Error(`Tool ${toolName} not found`);
    }
    async search(query, includeAnswer = false) {
        if (!this.apiKey)
            return "Error: No TAVILY_API_KEY configured.";
        try {
            console.log(`[TavilyMCP] 🔎 Searching: "${query}"`);
            const response = await fetch('https://api.tavily.com/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    api_key: this.apiKey,
                    query: query,
                    search_depth: "basic",
                    include_answer: includeAnswer,
                    max_results: 5
                })
            });
            if (!response.ok) {
                const err = await response.text();
                return `Error from Tavily: ${response.status} ${err}`;
            }
            const data = await response.json();
            // Format for LLM consumption
            let result = "";
            if (data.answer) {
                result += `[DIRECT ANSWER]: ${data.answer}\n\n`;
            }
            if (data.results && Array.isArray(data.results)) {
                result += "[SEARCH RESULTS]:\n";
                data.results.forEach((r, i) => {
                    result += `${i + 1}. ${r.title} (${r.url})\n   "${r.content.substring(0, 200)}..."\n\n`;
                });
            }
            return result;
        }
        catch (error) {
            return `Search exception: ${error.message}`;
        }
    }
}
exports.TavilyMCP = TavilyMCP;
