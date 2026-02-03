
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
                if (!apiKey) return "Error: DOCUMENT360_API_KEY is not configured.";

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
                    const result = await response.json();
                    return JSON.stringify(result, null, 2);
                } catch (e: any) {
                    return `Document360 Error: ${e.message}`;
                }
            }
        });

        this.isConnected = true;
    }
}
