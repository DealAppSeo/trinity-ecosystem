
import { smartLLM, LLMRequest } from '../lib/llm';
import { Task } from '../lib/agent/types';

async function testRouting() {
    console.log('--- 🧪 GLOBAL BRAIN ROUTING TEST ---');

    const scenarios: { name: string, request: LLMRequest }[] = [
        {
            name: 'New Free User (First Impression Boost)',
            request: {
                systemPrompt: 'You are a creative assistant.',
                userPrompt: 'Help me design a new logo.',
                role: 'designer',
                task: { title: 'Logo Design', description: 'Design a high-end logo', status: 'todo' } as Task
            }
        },
        {
            name: 'Founder User (Elite Priority)',
            request: {
                systemPrompt: 'You are a strategic advisor.',
                userPrompt: 'Analyze this market data.',
                role: 'founder',
                task: { title: 'Market Analysis', description: 'Complex data analysis', status: 'todo', user_tier: 'founder' } as any
            }
        },
        {
            name: 'Throttled Free User (Economy Shift)',
            request: {
                systemPrompt: 'You are a coding assistant.',
                userPrompt: 'Write a helper function.',
                role: 'developer',
                task: { title: 'Code Helper', description: 'Simple function', status: 'todo', user_tier: 'free' } as any
            }
        },
        {
            name: 'Specialized Keyword (Flux/Image)',
            request: {
                systemPrompt: 'You are an image prompt engineer.',
                userPrompt: 'Create a hyper-realistic Flux image of a futuristic city.',
                role: 'artist',
                task: { title: 'Image Generation', description: 'Flux city generation', status: 'todo' } as Task
            }
        },
        {
            name: 'Deep Reasoning Request (DeepSeek R1)',
            request: {
                systemPrompt: 'You are a logic expert.',
                userPrompt: 'Solve this complex logic puzzle using R1 reasoning.',
                role: 'logician',
                task: { title: 'Logic Puzzle', description: 'DeepSeek R1 logic test', status: 'todo' } as Task
            }
        }
    ];

    for (const scenario of scenarios) {
        console.log(`\n[Scenario] ${scenario.name}`);
        try {
            // Note: We are only testing the ROUTING logic here, 
            // so we expect failures if API keys are missing, 
            // but we want to see the CONSOLE LOGS for routing decisions.
            const result = await smartLLM(scenario.request);
            console.log(`[Result] Output length: ${result.output.length}`);
        } catch (e: any) {
            console.warn(`[Expected API Failure] ${e.message}`);
        }
    }
}

testRouting().then(() => console.log('\n--- 🏁 TEST COMPLETE ---'));
