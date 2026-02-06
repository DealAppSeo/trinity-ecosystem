
import { BaseMCP } from './BaseMCP';

/**
 * ResearchMCP - Deep Academic & Technical Research
 * Accesses Arxiv and Semantic Scholar to bridge gaps in "Elite Research".
 */
export class ResearchMCP extends BaseMCP {
    constructor() {
        super('ResearchSuite');
    }

    async connect(): Promise<void> {
        this.registerTool({
            name: 'arxiv_search',
            description: 'Search for academic papers on Arxiv (CS, Physics, Math, etc).',
            schema: {
                type: 'object',
                properties: {
                    query: { type: 'string' },
                    maxResults: { type: 'number', default: 5 }
                },
                required: ['query']
            },
            execute: this.arxivSearch.bind(this)
        });

        this.registerTool({
            name: 'semantic_scholar_search',
            description: 'Search for peer-reviewed papers with citations and abstracts.',
            schema: {
                type: 'object',
                properties: {
                    query: { type: 'string' }
                },
                required: ['query']
            },
            execute: this.semanticScholarSearch.bind(this)
        });
    }

    private async arxivSearch(args: { query: string, maxResults?: number }): Promise<string> {
        console.log(`[Research] 📄 Searching Arxiv: ${args.query}`);
        const url = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(args.query)}&max_results=${args.maxResults || 5}`;
        try {
            const response = await fetch(url);
            const text = await response.text();
            // Basic XML parsing simulation or simple extraction
            return `Arxiv Results for "${args.query}":\n(Summary of recent papers found via API. Recommend visiting Arxiv for full PDF). \n\n${text.substring(0, 500)}...`;
        } catch (e: any) {
            return `Arxiv Error: ${e.message}`;
        }
    }

    private async semanticScholarSearch(args: { query: string }): Promise<string> {
        console.log(`[Research] 📊 Searching Semantic Scholar: ${args.query}`);
        const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(args.query)}&limit=5&fields=title,authors,abstract,citationCount,url`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            return JSON.stringify(data.data || [], null, 2);
        } catch (e: any) {
            return `Semantic Scholar Error: ${e.message}`;
        }
    }
}
