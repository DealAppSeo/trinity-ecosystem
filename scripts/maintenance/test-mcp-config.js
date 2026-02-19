const dotenv = require('dotenv');
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
} catch (e) {
    console.error("❌ @supabase/mcp-server-postgrest: Not Found");
}

try {
    require.resolve('@modelcontextprotocol/server-github');
    console.log("✅ @modelcontextprotocol/server-github: Installed");
} catch (e) {
    console.error("❌ @modelcontextprotocol/server-github: Not Found");
}
