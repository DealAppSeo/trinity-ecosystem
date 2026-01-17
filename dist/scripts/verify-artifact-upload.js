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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const dotenv = __importStar(require("dotenv"));
dotenv.config({ path: path_1.default.resolve(process.cwd(), '.env.local') });
// Inject if still missing (Fallback)
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://qnnpjhlxljtqyigedwkb.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5Mzk1OTEsImV4cCI6MjA2NzUxNTU5MX0.6oG2DU_BD1uBnBrDoQFauvN1ZnkKo2ywkuwY-tPaQFw';
    process.env.SUPABASE_SERVICE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}
const ConstitutionalAgent_1 = require("../lib/agent/ConstitutionalAgent");
async function verify() {
    console.log("🧪 Starting Artifact Upload Verification...");
    const agent = new ConstitutionalAgent_1.ConstitutionalAgent({ name: 'trinity-verifier' });
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
    }
    else {
        console.log("⚠️ WARNING: Result is not a URL (might be DB ID or file path). Check logs.");
    }
}
verify().catch(console.error);
