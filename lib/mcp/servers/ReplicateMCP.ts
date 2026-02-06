
import { BaseMCP } from './BaseMCP';
import Replicate from 'replicate';

/**
 * ReplicateMCP Server
 * Provides access to thousands of open-source models (Video, Audio, Image, Text).
 * Bridges gaps in specialized AI capabilities like Video generation and Audio synthesis.
 */
export class ReplicateMCP extends BaseMCP {
    private replicate: Replicate | null = null;
    private apiKey: string;

    constructor() {
        super('Replicate');
        this.apiKey = process.env.REPLICATE_API_KEY || '';
    }

    async connect(): Promise<void> {
        if (!this.apiKey) {
            console.warn('[ReplicateMCP] ⚠️ REPLICATE_API_KEY is missing. Tools will return instructions instead of execution.');
        } else {
            this.replicate = new Replicate({
                auth: this.apiKey,
            });
            this.isConnected = true;
        }

        this.registerTool({
            name: 'replicate_run',
            description: 'Run any model on Replicate. Best for video generation, audio synthesis, or specialized deep-reasoning.',
            schema: {
                type: 'object',
                properties: {
                    model: { type: 'string', description: 'Model string (e.g., "lucataco/luma-dream-machine", "meta/meta-llama-3-70b-instruct")' },
                    input: { type: 'object', description: 'Input parameters for the model' }
                },
                required: ['model', 'input']
            },
            execute: this.runModel.bind(this)
        });

        this.registerTool({
            name: 'replicate_search',
            description: 'Search for models on Replicate for a specific task (e.g., "video generation").',
            schema: {
                type: 'object',
                properties: {
                    query: { type: 'string' }
                },
                required: ['query']
            },
            execute: this.searchModels.bind(this)
        });
    }

    private async runModel(args: { model: any, input: any }): Promise<string> {
        if (!this.replicate) {
            return `ERROR: REPLICATE_API_KEY is missing. To enable Video/Audio/Specialized AI, please provide the key in environment variables. Model requested: ${args.model}`;
        }

        console.log(`[Replicate] 🚀 Running model: ${args.model}`);
        try {
            const output = await this.replicate.run(args.model, { input: args.input });
            return JSON.stringify(output, null, 2);
        } catch (e: any) {
            console.error(`[Replicate] ❌ Execution failed: ${e.message}`);
            return `Replicate Error: ${e.message}`;
        }
    }

    private async searchModels(args: { query: string }): Promise<string> {
        // [AUDIT] Since Replicate SDK search is limited, we provide a curated list of elite models for common tasks
        const commonModels = {
            "video": ["lucataco/luma-dream-machine", "stability-ai/stable-video-diffusion", "camenduru/animate-diff"],
            "audio": ["fofr/musicgen", "afiaka87/audioldm", "lucataco/whisper-large-v3"],
            "voice": ["elevenlabs/eleven-labs-voice"],
            "image": ["black-forest-labs/flux-schnell", "stability-ai/sdxl"],
            "code": ["meta/codellama-34b-instruct"]
        };

        const q = args.query.toLowerCase();
        let suggestions: string[] = [];
        if (q.includes('video')) suggestions = commonModels.video;
        else if (q.includes('audio') || q.includes('music')) suggestions = commonModels.audio;
        else if (q.includes('voice')) suggestions = commonModels.voice;
        else if (q.includes('image') || q.includes('design')) suggestions = commonModels.image;
        else if (q.includes('code')) suggestions = commonModels.code;

        return `Top models for "${args.query}":\n${suggestions.length > 0 ? suggestions.join('\n') : "Use Replicate web search to find specific models then use replicate_run."}`;
    }
}
