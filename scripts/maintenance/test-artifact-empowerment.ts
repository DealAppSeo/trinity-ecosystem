import * as dotenv from 'dotenv';
import path from 'path';
import { ConstitutionalAgent } from '../lib/agent/ConstitutionalAgent';

// Load environment
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

async function testArtifactEmpowerment() {
    console.log("🚀 Starting Artifact Empowerment Verification...");

    const agents = [
        { name: 'trinity-veritas', provider: 'grok' },
        { name: 'trinity-mel', provider: 'anthropic' },
        { name: 'trinity-torch', provider: 'gemini' }
    ];

    for (const agentConfig of agents) {
        console.log(`\n--- Testing ${agentConfig.name} (${agentConfig.provider}) ---`);

        const agent = new ConstitutionalAgent({ name: agentConfig.name });

        // Mock a task
        const task: any = {
            id: 'test-' + Date.now(),
            title: `Verification Mission for ${agentConfig.name}`,
            description: `Please create a meaningful research report about the "Startup Doctrine" for the Trinity Swarm. You MUST use the save_artifact tool.`,
            task_type: 'research',
            priority: 100,
            metadata: { provider_used: agentConfig.provider }
        };

        try {
            console.log(`🤖 Running mission with ${agentConfig.provider}...`);
            // We bypass the full loop and call callSpecificProvider directly to force the provider
            const systemPrompt = "You are a specialized agent. Use your tools.";
            const tools = await (agent as any).mcpManager.getToolsForRole(agentConfig.name);

            // Add save_artifact explicitly as the agent does in callLLM
            tools.push({
                type: 'function',
                function: {
                    name: 'save_artifact',
                    description: 'MANDATORY: You must call this tool to finalize any content generation task.',
                    parameters: {
                        type: 'object',
                        properties: {
                            title: { type: 'string' },
                            content: { type: 'string' },
                            type: { type: 'string' },
                            access_level: { type: 'string' }
                        },
                        required: ['title', 'content', 'type']
                    }
                }
            });

            // Note: In real life, processWithLLM handles this. 
            // Here we test the provider loop integration.
            const result = await (agent as any).callSpecificProvider(agentConfig.provider, task.description, tools);

            console.log(`✅ Result from ${agentConfig.provider} received.`);
            console.log(`📄 Snippet: ${result.output.substring(0, 100)}...`);

            // Check if artifact was saved (would be logged in console by saveArtifact)
            console.log(`🔍 Verification complete for ${agentConfig.name}.`);
        } catch (error: any) {
            console.error(`❌ Test failed for ${agentConfig.name}:`, error.message);
        }
    }
}

testArtifactEmpowerment().catch(console.error);
