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
const ConstitutionalAgent_1 = require("../lib/agent/ConstitutionalAgent"); // Adjust path if needed
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Load env vars
const dotenv = __importStar(require("dotenv"));
dotenv.config({ path: '.env.local' });
async function testArtifactCreation() {
    console.log('🧪 TEST: Verifying Local Artifact Creation...');
    // 1. Mock Config
    const agentName = 'TEST-UNIT';
    // 2. Instantiate Agent
    try {
        console.log('🤖 Initializing Agent...');
        const agent = new ConstitutionalAgent_1.ConstitutionalAgent({ name: agentName });
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
        }
        else {
            console.error('❌ FAILURE: File not found on disk.');
        }
    }
    catch (e) {
        console.error('❌ ERROR:', e.message);
        console.error(e.stack);
    }
}
testArtifactCreation();
