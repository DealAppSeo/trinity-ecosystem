
import { BaseMCP } from './BaseMCP';

/**
 * [ANTIGRAVITY] NotionMCP Server
 * Provides enterprise knowledge retrieval from Notion databases and pages.
 */
export class NotionMCP extends BaseMCP {
    constructor() {
        super('Notion');
    }

    async connect(): Promise<void> {
        const apiKey = process.env.NOTION_API_KEY;

        this.registerTool({
            name: 'notion_query_database',
            description: 'Query a Notion database for specific records.',
            schema: {
                type: 'object',
                properties: {
                    databaseId: { type: 'string' },
                    filter: { type: 'object' },
                    sorts: { type: 'array' }
                },
                required: ['databaseId']
            },
            execute: async (args: any) => {
                if (!apiKey) return "Error: NOTION_API_KEY is not configured.";

                console.log(`[Notion] 📓 Querying database: ${args.databaseId}`);
                try {
                    const response = await fetch(`https://api.notion.com/v1/databases/${args.databaseId}/query`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Notion-Version': '2022-06-28',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            filter: args.filter,
                            sorts: args.sorts
                        })
                    });
                    const result = await response.json();
                    return JSON.stringify(result, null, 2);
                } catch (e: any) {
                    return `Notion Error: ${e.message}`;
                }
            }
        });

        this.registerTool({
            name: 'notion_get_page',
            description: 'Retrieve content from a specific Notion page.',
            schema: {
                type: 'object',
                properties: {
                    pageId: { type: 'string' }
                },
                required: ['pageId']
            },
            execute: async (args: any) => {
                if (!apiKey) return "Error: NOTION_API_KEY is not configured.";

                console.log(`[Notion] 📄 Fetching page: ${args.pageId}`);
                try {
                    const response = await fetch(`https://api.notion.com/v1/pages/${args.pageId}`, {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Notion-Version': '2022-06-28'
                        }
                    });
                    const result = await response.json();
                    return JSON.stringify(result, null, 2);
                } catch (e: any) {
                    return `Notion Error: ${e.message}`;
                }
            }
        });

        this.isConnected = true;
    }
}
