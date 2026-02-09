
import { BaseMCP } from './BaseMCP';

/**
 * KnowledgeMCP Server
 * Bridges Document360 for knowledge management.
 */
export class KnowledgeMCP extends BaseMCP {
    constructor() {
        super('Knowledge');
    }

    async connect(): Promise<void> {
        const apiKey = process.env.DOCUMENT360_API_KEY;

        this.registerTool({
            name: 'doc360_search',
            description: 'Search for articles in Document360 knowledge base.',
            schema: {
                type: 'object',
                properties: {
                    query: { type: 'string' },
                    projectVersionID: { type: 'string' }
                },
                required: ['query']
            },
            execute: async (args: any) => {
                if (!apiKey) {
                    console.warn(`[Knowledge] ⚠️ DOCUMENT360_API_KEY missing. Falling back to TavilySearch.`);
                    return `Note: Primary DB offline. FALLBACK SEARCH: No internal articles found, please use search_web instead.`;
                }

                console.log(`[Knowledge] 📚 Searching Document360: ${args.query}`);
                try {
                    const response = await fetch(`https://api.document360.io/v1/Articles/Search`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'api_token': apiKey
                        },
                        body: JSON.stringify({
                            Query: args.query,
                            ProjectVersionId: args.projectVersionID
                        })
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }

                    const result = await response.json();
                    if (result.Data?.length === 0) {
                        console.warn(`[Knowledge] ⚠️ No internal matches. Recommending web search.`);
                        return "No internal matches found. FALLBACK RECOMMENDED: Please use 'search_web' (Tavily) or 'brave_web_search' for broader context.";
                    }
                    return JSON.stringify(result, null, 2);
                } catch (e: any) {
                    console.error(`[Knowledge] ⚠️ Doc360 Error: ${e.message}. Triggering redundancy logic.`);
                    return `INTERNAL_DB_ERROR: ${e.message}. FALLBACK RECOMMENDED: Use 'search_web' or 'brave_web_search'.`;
                }
            }
        });

        this.isConnected = true;
    }
}
