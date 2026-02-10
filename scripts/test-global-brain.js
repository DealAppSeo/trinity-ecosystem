
const { smartLLM } = require('../dist/lib/llm');
// Note: This assumes the build folder 'dist' exists and is up to date.

async function testRouting() {
    console.log('--- 🧪 GLOBAL BRAIN ROUTING TEST (JS) ---');

    const scenarios = [
        {
            name: 'New Free User (First Impression Boost)',
            request: {
                systemPrompt: 'You are a creative assistant.',
                userPrompt: 'Help me design a new logo.',
                role: 'designer',
                task: { title: 'Logo Design', description: 'Design a high-end logo', status: 'todo' }
            }
        },
        {
            name: 'Founder User (Elite Priority)',
            request: {
                systemPrompt: 'You are a strategic advisor.',
                userPrompt: 'Analyze this market data.',
                role: 'founder',
                task: { title: 'Market Analysis', description: 'Complex data analysis', status: 'todo', user_tier: 'founder' }
            }
        },
        {
            name: 'Specialized Keyword (Flux/Image)',
            request: {
                systemPrompt: 'You are an image prompt engineer.',
                userPrompt: 'Create a hyper-realistic Flux image of a futuristic city.',
                role: 'artist',
                task: { title: 'Image Generation', description: 'Flux city generation', status: 'todo' }
            }
        }
    ];

    for (const scenario of scenarios) {
        console.log(`\n[Scenario] ${scenario.name}`);
        try {
            // We expect failures if API keys are missing, but we want to see the CONSOLE LOGS for routing decisions.
            const result = await smartLLM(scenario.request);
            console.log(`[Result] Output received.`);
        } catch (e) {
            console.warn(`[Routing Check] ${e.message}`);
        }
    }
}

testRouting().catch(console.error);
