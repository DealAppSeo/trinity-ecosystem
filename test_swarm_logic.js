
const { SwarmOrchestrator, SwarmState } = require('./lib/agent/SwarmOrchestrator');
const { IntelligenceRouter } = require('./lib/agent/IntelligenceRouter');

async function testLogic() {
    console.log('--- TESTING SWARM INTELLIGENCE LOGIC ---');

    // 1. Test IntelligenceRouter for Kimi
    console.log('\n[1] Testing IntelligenceRouter model detection:');
    const router = new IntelligenceRouter('trinity-veritas');
    const testTask = { title: 'Analyze the complex logic of Kimi K2.5', description: 'Deep reasoning required.' };
    const routedModel = router.detectSpecializedRequest(testTask);
    console.log(`Task: "${testTask.title}" -> Routed Model: ${routedModel}`);

    // 2. Test SwarmOrchestrator Transitions
    console.log('\n[2] Testing SwarmOrchestrator transitions:');

    const researchTask = {
        id: 'test-123',
        title: 'Research Kimi K2.5 multimodal features',
        description: 'Audit the open-source model.',
        metadata: JSON.stringify({ swarm_state: SwarmState.RESEARCH })
    };

    const highEval = { score: 85, handoff_required: true };
    const lowEval = { score: 30, critique: 'Insufficient depth.' };

    const researchHandoff = SwarmOrchestrator.planNextStep(researchTask, 'Research result content...', highEval);
    console.log(`Research (High Score) -> Next Agent: ${researchHandoff?.nextAgent}, State: ${researchHandoff?.nextState}`);

    const researchRetry = SwarmOrchestrator.planNextStep(researchTask, 'Failing result...', lowEval);
    console.log(`Research (Low Score) -> Next State: ${researchRetry?.nextState} (Retry)`);

    const designTask = {
        id: 'test-456',
        title: 'Design UI for Kimi integration',
        metadata: JSON.stringify({ swarm_state: SwarmState.DESIGN })
    };

    const designHandoff = SwarmOrchestrator.planNextStep(designTask, 'UI Mockup content...', highEval);
    console.log(`Design (High Score) -> Next Agent: ${designHandoff?.nextAgent}, State: ${designHandoff?.nextState}`);
}

testLogic();
