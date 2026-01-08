
import { ConstitutionalAgent } from '../lib/agent/ConstitutionalAgent';
import { Task } from '../lib/agent/types';
import * as fs from 'fs';
import * as path from 'path';

// Mock Supabase to avoid real DB calls during this unit test
const mockSupabase = {
    from: () => ({
        select: () => ({
            order: () => ({
                limit: () => Promise.resolve({ data: [] })
            })
        }),
        update: () => ({ eq: () => Promise.resolve({}) })
    })
} as any;

async function testContextPipe() {
    console.log("🧪 Starting Context Pipe Test...");

    // 1. Setup Dummy Wisdom
    const wisdomDir = path.resolve(process.cwd(), 'artifacts', 'wisdom');
    if (!fs.existsSync(wisdomDir)) fs.mkdirSync(wisdomDir, { recursive: true });

    const testFile = 'test_manifest.md';
    const testContent = "This is a test wisdom artifact containing keywords like Learning Loop.";
    fs.writeFileSync(path.join(wisdomDir, testFile), testContent);
    console.log("✅ Created dummy wisdom file.");

    // 2. Mock Env Deps
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mock.supabase.co";
    process.env.SUPABASE_SERVICE_KEY = "mock_key";

    // 3. Instantiate Agent (Standard Constructor)
    // We cast to any to bypass strict property checks for this partial mock
    const agent = new ConstitutionalAgent(
        {
            name: 'HDM'
        } as any
    );

    // 4. Inject Mock DB & Mocks
    (agent as any).supabase = mockSupabase;
    (agent as any).redis = { get: () => null, set: () => null };

    // 5. Define Task
    const task: Task = {
        id: "999",
        title: "Execute Learning Loop Strategy",
        description: "A task that should trigger the retrieval of the loop wisdom.",
        status: 'pending',
        priority: 1,
        created_at: new Date().toISOString()
    };

    // 6. Run gatherWisdom directly
    console.log("🧠 calling gatherWisdom()...");
    const wisdom = await agent.gatherWisdom(task);

    // 7. Verify Output
    console.log("---------------------------------------------------");
    console.log(wisdom);
    console.log("---------------------------------------------------");

    if (wisdom.includes("ANFIS suggests checking")) {
        console.log("✅ ANFIS Logic Working (Latency Opportunity Detected)");
    } else {
        console.log("⚠️ ANFIS did not trigger (Check thresholds)");
    }

    if (wisdom.includes("test_manifest.md")) {
        console.log("✅ File Retrieval Working (Found relevant artifact)");
    } else {
        console.error("❌ Failed to retrieve artifact.");
    }

    // Cleanup
    if (fs.existsSync(path.join(wisdomDir, testFile))) {
        fs.unlinkSync(path.join(wisdomDir, testFile));
    }
}

// Check if we can run this directly (ts-node)
testContextPipe().catch((e) => {
    console.error("Test Failed:", e);
    process.exit(1);
});
