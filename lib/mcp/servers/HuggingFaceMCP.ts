
import { BaseMCP } from './BaseMCP';

/**
 * HuggingFaceMCP Server
 * Provides access to HuggingFace Inference API for NLP, Image, and specialized models.
 */
export class HuggingFaceMCP extends BaseMCP {
    private apiKey: string;

    constructor() {
        super('HuggingFace');
        this.apiKey = process.env.HUGGINGFACE_API_KEY || '';
    }

    async connect(): Promise<void> {
        this.registerTool({
            name: 'hf_inference',
            description: 'Call a HuggingFace model for inference.',
            schema: {
                type: 'object',
                properties: {
                    model: { type: 'string', description: 'The model repo id, e.g. "gpt2" or "meta-llama/Llama-2-7b-chat-hf"' },
                    inputs: { type: 'string', description: 'The input text or data' },
                    parameters: { type: 'object', description: 'Optional inference parameters' }
                },
                required: ['model', 'inputs']
            },
            execute: async (args: any) => {
                if (!this.apiKey) return "Error: HUGGINGFACE_API_KEY is not configured.";

                console.log(`[HF] 🤖 Inferencing model: ${args.model}`);
                try {
                    const response = await fetch(`https://api-inference.huggingface.co/models/${args.model}`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${this.apiKey}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            inputs: args.inputs,
                            parameters: args.parameters || {}
                        })
                    });
                    const result = await response.json();
                    return JSON.stringify(result, null, 2);
                } catch (e: any) {
                    return `HuggingFace Error: ${e.message}`;
                }
            }
        });

        this.isConnected = true;
    }
}
