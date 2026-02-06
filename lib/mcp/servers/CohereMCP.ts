import { BaseMCP } from './BaseMCP';
import { MCPTool } from '../types';

/**
 * CohereMCP Server
 * Integrates Cohere's RAG and ReRank capabilities for better information retrieval.
 */
export class CohereMCP extends BaseMCP {
    private apiKey: string;

    constructor() {
        super('Cohere');
        this.apiKey = process.env.COHERE_API_KEY || '';
    }

    async connect(): Promise<void> {
        if (!this.apiKey) {
            console.warn('[CohereMCP] COHERE_API_KEY is missing.');
            return;
        }
        this.isConnected = true;
    }

    async getTools(): Promise<MCPTool[]> {
        return [
            {
                name: 'cohere_rerank',
                description: 'Rerank a list of documents based on a query for better relevance.',
                schema: {
                    type: 'object',
                    properties: {
                        query: { type: 'string' },
                        documents: { type: 'array', items: { type: 'string' } },
                        top_n: { type: 'number', default: 3 }
                    },
                    required: ['query', 'documents']
                },
                execute: async (args: any) => this.callTool('cohere_rerank', args)
            },
            {
                name: 'cohere_rag',
                description: 'Generate answers using Cohere with retrieval-augmented generation.',
                schema: {
                    type: 'object',
                    properties: {
                        message: { type: 'string' },
                        documents: { type: 'array', items: { type: 'object' } }
                    },
                    required: ['message', 'documents']
                },
                execute: async (args: any) => this.callTool('cohere_rag', args)
            }
        ];
    }

    async callTool(toolName: string, args: any): Promise<string> {
        if (!this.isConnected) return "Cohere API not connected. Check COHERE_API_KEY.";

        if (toolName === 'cohere_rerank') {
            try {
                const response = await fetch('https://api.cohere.ai/v1/rerank', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        query: args.query,
                        documents: args.documents,
                        top_n: args.top_n,
                        model: 'rerank-english-v3.0'
                    })
                });
                const data = await response.json();
                return JSON.stringify(data, null, 2);
            } catch (e: any) {
                return `Cohere Error: ${e.message}`;
            }
        }

        if (toolName === 'cohere_rag') {
            try {
                const response = await fetch('https://api.cohere.ai/v1/chat', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message: args.message,
                        documents: args.documents,
                        prompt_truncation: 'AUTO'
                    })
                });
                const data = await response.json();
                return JSON.stringify(data, null, 2);
            } catch (e: any) {
                return `Cohere Error: ${e.message}`;
            }
        }

        throw new Error(`Tool ${toolName} not supported.`);
    }
}
