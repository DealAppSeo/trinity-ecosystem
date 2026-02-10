import { BaseMCP } from './BaseMCP';

/**
 * ResearchMCP - Peer-Reviewed Research
 * Focuses on Semantic Scholar for deep citation analysis.
 * (Arxiv logic moved to dedicated ArxivMCP).
 */
export class ResearchMCP extends BaseMCP {
    constructor() {
        super('ResearchSuite');
    }

    async connect(): Promise<void> {
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
