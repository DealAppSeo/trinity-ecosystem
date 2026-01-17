"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const ConstitutionalAgent_1 = require("../lib/agent/ConstitutionalAgent");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
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
};
async function testContextPipe() {
    console.log("🧪 Starting Context Pipe Test...");
    // 1. Setup Dummy Wisdom
    const wisdomDir = path.resolve(process.cwd(), 'artifacts', 'wisdom');
    if (!fs.existsSync(wisdomDir))
        fs.mkdirSync(wisdomDir, { recursive: true });
    const testFile = 'test_manifest.md';
    const testContent = "This is a test wisdom artifact containing keywords like Learning Loop.";
    fs.writeFileSync(path.join(wisdomDir, testFile), testContent);
    console.log("✅ Created dummy wisdom file.");
    // 2. Mock Env Deps
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mock.supabase.co";
    process.env.SUPABASE_SERVICE_KEY = "mock_key";
    // 3. Instantiate Agent (Standard Constructor)
    // We cast to any to bypass strict property checks for this partial mock
    const agent = new ConstitutionalAgent_1.ConstitutionalAgent({
        name: 'HDM'
    });
    // 4. Inject Mock DB & Mocks
    agent.supabase = mockSupabase;
    agent.redis = { get: () => null, set: () => null };
    // 5. Define Task
    const task = {
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
    }
    else {
        console.log("⚠️ ANFIS did not trigger (Check thresholds)");
    }
    if (wisdom.includes("test_manifest.md")) {
        console.log("✅ File Retrieval Working (Found relevant artifact)");
    }
    else {
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
