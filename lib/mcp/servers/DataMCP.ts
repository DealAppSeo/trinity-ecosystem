
import { BaseMCP } from './BaseMCP';

/**
 * DataMCP Server
 * Bridges Airtable for data management.
 */
export class DataMCP extends BaseMCP {
    constructor() {
        super('Data');
    }

    async connect(): Promise<void> {
        const apiKey = process.env.AIRTABLE_API_KEY;
        const baseId = process.env.AIRTABLE_BASE_ID;

        this.registerTool({
            name: 'airtable_list_records',
            description: 'List records from an Airtable table.',
            schema: {
                type: 'object',
                properties: {
                    tableName: { type: 'string' },
                    maxRecords: { type: 'number', default: 100 },
                    view: { type: 'string' }
                },
                required: ['tableName']
            },
            execute: async (args: any) => {
                if (!apiKey || !baseId) return "Error: AIRTABLE_API_KEY or AIRTABLE_BASE_ID is not configured.";

                console.log(`[Data] 📊 Listing Airtable records: ${args.tableName}`);
                try {
                    const response = await fetch(`https://api.airtable.com/v0/${baseId}/${args.tableName}?maxRecords=${args.maxRecords}${args.view ? `&view=${args.view}` : ''}`, {
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    const result = await response.json();
                    return JSON.stringify(result, null, 2);
                } catch (e: any) {
                    return `Airtable Error: ${e.message}`;
                }
            }
        });

        this.registerTool({
            name: 'airtable_create_record',
            description: 'Create a new record in Airtable.',
            schema: {
                type: 'object',
                properties: {
                    tableName: { type: 'string' },
                    fields: { type: 'object' }
                },
                required: ['tableName', 'fields']
            },
            execute: async (args: any) => {
                if (!apiKey || !baseId) return "Error: AIRTABLE_API_KEY or AIRTABLE_BASE_ID is not configured.";

                try {
                    const response = await fetch(`https://api.airtable.com/v0/${baseId}/${args.tableName}`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ fields: args.fields })
                    });
                    const result = await response.json();
                    return JSON.stringify(result, null, 2);
                } catch (e: any) {
                    return `Airtable Error: ${e.message}`;
                }
            }
        });

        this.isConnected = true;
    }
}
