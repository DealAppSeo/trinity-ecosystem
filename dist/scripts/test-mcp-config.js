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
const dotenv = __importStar(require("dotenv"));
dotenv.config({ path: '.env.local' });
console.log("🔍 Verifying CTO MCP Configuration...");
const hasSupabaseUrl = !!process.env.SUPABASE_URL;
const hasSupabaseKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasGithubToken = !!process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
console.log(`✅ SUPABASE_URL: ${hasSupabaseUrl ? 'Set' : 'Missing'}`);
console.log(`✅ SUPABASE_SERVICE_ROLE_KEY: ${hasSupabaseKey ? 'Set' : 'Missing'}`);
console.log(`✅ GITHUB_PERSONAL_ACCESS_TOKEN: ${hasGithubToken ? 'Set' : 'Missing'}`);
try {
    require.resolve('@supabase/mcp-server-postgrest');
    console.log("✅ @supabase/mcp-server-postgrest: Installed");
}
catch (e) {
    console.error("❌ @supabase/mcp-server-postgrest: Not Found");
}
try {
    require.resolve('@modelcontextprotocol/server-github');
    console.log("✅ @modelcontextprotocol/server-github: Installed");
}
catch (e) {
    console.error("❌ @modelcontextprotocol/server-github: Not Found");
}
