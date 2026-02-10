
import { BaseMCP } from './BaseMCP';
import { MCPTool } from '../types';

/**
 * ArxivMCP - Academic & Scientific Grounding
 * Specialized for deep technical research and PDF analysis.
 */
export class ArxivMCP extends BaseMCP {
    constructor() {
        super('ArxivSuite');
    }

    async connect(): Promise<void> {
        this.isConnected = true;
    }

    async getTools(): Promise<MCPTool[]> {
        return [
            {
                name: 'arxiv_search',
                description: 'Search for academic papers on Arxiv (CS, Physics, Math, etc).',
                schema: {
                    type: 'object',
                    properties: {
                        query: { type: 'string' },
                        maxResults: { type: 'number', default: 5 },
                        category: { type: 'string', description: 'Optional category (e.g. cs.AI, stat.ML)' }
                    },
                    required: ['query']
                },
                execute: async (args: any) => this.arxivSearch(args)
            },
            {
                name: 'get_paper_summary',
                description: 'Fetch detailed summary/abstract and metadata for a specific Arxiv ID.',
                schema: {
                    type: 'object',
                    properties: {
                        arxiv_id: { type: 'string', description: 'The unique Arxiv ID (e.g. 2305.15334)' }
                    },
                    required: ['arxiv_id']
                },
                execute: async (args: any) => this.getPaperSummary(args.arxiv_id)
            }
        ];
    }

    async callTool(toolName: string, args: any): Promise<string> {
        if (toolName === 'arxiv_search') return await this.arxivSearch(args);
        if (toolName === 'get_paper_summary') return await this.getPaperSummary(args.arxiv_id);
        throw new Error(`Tool ${toolName} not found in ArxivSuite`);
    }

    private async arxivSearch(args: { query: string, maxResults?: number, category?: string }): Promise<string> {
        console.log(`[Arxiv] 📄 Searching Arxiv: ${args.query}`);
        let url = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(args.query)}`;
        if (args.category) url += `+AND+cat:${args.category}`;
        url += `&max_results=${args.maxResults || 5}`;

        try {
            const response = await fetch(url);
            const text = await response.text();
            return `Arxiv Results for "${args.query}":\n\n${text.substring(0, 2000)}`;
        } catch (e: any) {
            return `Arxiv Error: ${e.message}`;
        }
    }

    private async getPaperSummary(arxiv_id: string): Promise<string> {
        console.log(`[Arxiv] 📘 Fetching summary for: ${arxiv_id}`);
        const url = `http://export.arxiv.org/api/query?id_list=${arxiv_id}`;
        try {
            const response = await fetch(url);
            const text = await response.text();
            return text;
        } catch (e: any) {
            return `Arxiv Summary Error: ${e.message}`;
        }
    }
}
