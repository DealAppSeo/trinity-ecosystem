/**
 * Test 3-Ply BFT and Risk-Based Routing
 */
import { BFTModel, ConsensusPly } from '../../lib/agent/BFTModel';
import { IntelligenceRouter } from '../../lib/agent/IntelligenceRouter';
import { Task } from '../../lib/agent/types';

console.log('--- Testing BFT Consensus ---');
const results = [
    { ply: ConsensusPly.EXECUTION, agentName: 'A1', output: 'Success', confidence: 95, family: 'OpenAI' },
    { ply: ConsensusPly.EXECUTION, agentName: 'A2', output: 'Success', confidence: 90, family: 'Anthropic' },
    { ply: ConsensusPly.EXECUTION, agentName: 'A3', output: 'Failure', confidence: 80, family: 'Google' }
];
const consensus = BFTModel.calculateConsensus(results);
console.log('BFT Consensus Result:', consensus);

console.log('\n--- Testing Risk-Based Routing ---');
const router = new IntelligenceRouter('trinity-navigator');
const criticalTask: Task = {
    id: 't-1',
    title: 'CRITICAL: Wipe Production Database',
    description: 'Emergency cleanup of production funds and keys',
    status: 'todo',
    priority: 100
};

async function testRouting() {
    const providers = ['openai', 'anthropic', 'gemini', 'groq', 'deepseek'];
    const selection = await router.route(criticalTask, providers);
    console.log('Selection for CRITICAL task:', selection);
    console.log('Selection Length:', selection.length, '(Expected >= 3 for BFT)');
}

testRouting();
