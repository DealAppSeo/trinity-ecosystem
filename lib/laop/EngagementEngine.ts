import { supabaseAdmin as supabase } from '../supabase';
import { IntelligenceRouter } from '../agent/IntelligenceRouter';
import { UnifiedServiceRegistry } from '../agent/UnifiedServiceRegistry';

export interface LAOPContext {
    userId?: string;
    background?: string;
    pastQuestions?: string[];
    currentTask?: string;
}

export class EngagementEngine {
    private router: IntelligenceRouter;
    private registry: UnifiedServiceRegistry;

    constructor(agentName: string) {
        this.router = new IntelligenceRouter(agentName);
        this.registry = UnifiedServiceRegistry.getInstance();
    }

    /**
     * Estimates if a query will take too long or has low confidence.
     */
    async evaluate(query: string): Promise<{ shouldEngage: boolean; estimatedLatency: number }> {
        await this.registry.sync();
        const providers = await this.router.route({ title: query, description: query } as any, ['openai', 'anthropic', 'gemini', 'groq']);

        if (providers.length === 0) return { shouldEngage: false, estimatedLatency: 0 };

        const info = this.registry.getServiceByKey(providers[0]);
        const latency = info?.latency_ms_avg || 2000;

        // Threshold: > 3s or some other logic
        return {
            shouldEngage: latency > 3000 || query.length > 200, // Long queries usually take more time
            estimatedLatency: latency
        };
    }

    /**
     * Generates a qualifying question to engage the user.
     */
    async generateQualifyingQuestion(query: string, context: LAOPContext): Promise<string> {
        const prompt = `
        As a brilliant and warm AI colleague, you are about to provide a deep answer to: "${query}".
        However, you want to use the next 5 seconds to better personalize the result.
        
        USER CONTEXT:
        - Background: ${context.background || 'Unknown'}
        - Current Task: ${context.currentTask || 'Unknown'}
        
        RULES:
        1. Always acknowledge the surface answer if obvious: "It's often cited that [X]..."
        2. Rephrase the user's question naturally (don't quote it).
        3. Reference context if available.
        4. Ask EXACTLY ONE qualifying question that is genuinely useful for the final answer.
        5. Tone: Warm, curious, expert.
        6. NO filler, NO bureaucracy.
        
        Example: "It's often cited that Base Sepolia has a 2s block time—but given you're building a high-frequency bridge, I want to be precise. Are you more concerned about finality depth or sequencer latency?"
        
        Response:`;

        // We use a fast provider for engagement
        const { data } = await supabase.from('trinity_tasks').insert([{
            title: `[LAOP-ENGAGE] ${query.slice(0, 50)}`,
            description: prompt,
            status: 'todo',
            task_type: 'chat',
            priority: 5,
            metadata: { automated: true, provider: 'groq' }
        }]).select().single();

        // For now, we'll use a mocked fast-path if LLM isn't immediately available
        // In a real scenario, this would call the direct LLM API for 500ms response
        return `I'm digging into your question about "${query.slice(0, 30)}..." — but to make this truly useful for your ${context.currentTask || 'work'}, could you clarify one thing: are you looking for a technical deep-dive or a strategic overview?`;
    }

    async logEngagement(data: {
        query: string;
        engagement_question: string;
        user_response?: string;
        final_answer?: string;
        quality_score?: number;
        background_tasks_count?: number;
        latency_ms?: number;
    }) {
        await supabase.from('laop_engagements').insert([data]);
    }
}
