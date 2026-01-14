
import path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Inject if still missing (Fallback)
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://qnnpjhlxljtqyigedwkb.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5Mzk1OTEsImV4cCI6MjA2NzUxNTU5MX0.6oG2DU_BD1uBnBrDoQFauvN1ZnkKo2ywkuwY-tPaQFw';
    process.env.SUPABASE_SERVICE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

import { ConstitutionalAgent } from '../lib/agent/ConstitutionalAgent';

async function verify() {
    console.log("🧪 Starting Artifact Upload Verification...");

    const agent = new ConstitutionalAgent({ name: 'trinity-verifier' });

    // Simulate Task ID
    const taskId = `test-${Date.now()}`;
    const content = `# Verification Artifact
    
    This is a test artifact created by the verification script at ${new Date().toISOString()}.
    
    It should be uploaded to Supabase Storage and a URL should be returned.`;

    console.log(`📝 Saving artifact for task ${taskId}...`);

    const result = await agent.saveArtifact(taskId, content, 'md');

    console.log(`✅ Result: ${result}`);

    if (result && result.startsWith('https')) {
        console.log("🎉 SUCCESS: Artifact uploaded and public URL generated.");
    } else {
        console.log("⚠️ WARNING: Result is not a URL (might be DB ID or file path). Check logs.");
    }
}

verify().catch(console.error);
