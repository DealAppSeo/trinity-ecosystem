
import { ConstitutionalAgent } from '../lib/agent/ConstitutionalAgent'; // Adjust path if needed
import * as fs from 'fs';
import * as path from 'path';

// Load env vars
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testArtifactCreation() {
    console.log('🧪 TEST: Verifying Local Artifact Creation...');

    // 1. Mock Config
    const agentName = 'TEST-UNIT';

    // 2. Instantiate Agent
    try {
        console.log('🤖 Initializing Agent...');
        const agent = new ConstitutionalAgent({ name: agentName });

        // 3. Define Test Artifact
        const taskId = 'test-verification-' + Date.now();
        const content = `# Verification Artifact
        
        This file proves that the agent has "hands" and can write to the local disk.
        
        - Timestamp: ${new Date().toISOString()}
        - Agent: ${agentName}
        
        If you are reading this, the system works.`;

        // 4. Call saveArtifact
        console.log('💾 Attempting to save artifact...');
        const result = await agent.saveArtifact(taskId, content, 'markdown');

        console.log(`✅ Result URL: ${result}`);

        // 5. Verify File Existence
        const expectedPath = path.resolve(process.cwd(), 'artifacts', agentName.toLowerCase());
        const files = fs.readdirSync(expectedPath);
        const createdFile = files.find(f => f.includes(taskId.substring(0, 8)));

        if (createdFile) {
            console.log(`🎉 SUCCESS: File found at ${path.join(expectedPath, createdFile)}`);
        } else {
            console.error('❌ FAILURE: File not found on disk.');
        }

    } catch (e: any) {
        console.error('❌ ERROR:', e.message);
        console.error(e.stack);
    }
}

testArtifactCreation();
