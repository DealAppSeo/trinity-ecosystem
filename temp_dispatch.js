const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env.local');
let envContent = '';
try {
  envContent = fs.readFileSync(envPath, 'utf8');
} catch (err) {
  try {
    envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  } catch (err2) {
    console.error("Could not read .env.local or .env file.");
    process.exit(1);
  }
}

const envUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim() || envContent.match(/SUPABASE_URL=(.*)/)?.[1]?.trim();
const envKey = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim() || envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();

if (!envUrl || !envKey) {
  console.error("Supabase credentials not found in env file.");
  process.exit(1);
}

const supabase = createClient(envUrl, envKey);

const content = `1. REPOS I ACTUALLY PUSH TO: I only modify local files in the active workspace. Both trinity-ecosystem and trinity-symphony-shared directories map to the same remote repo (DealAppSeo/trinity-symphony-shared).
2. TRINITY-SYMPHONY-SHARED ON VERCEL — did I configure this as a Vite frontend? Should it be on Vercel at all or only Railway: No, it is a Next.js frontend (not Vite), configured to deploy on Vercel. Only the backend AI Agents (Node/Python) go on Railway.
3. DEPLOYMENT DRIFT — do I sometimes push to whichever repo is open: Yes.
4. WHAT DO I OWN vs CC: I (Gemini) own the Next.js React frontend, TrustRails dashboard UI, and the visual UX of the HyperDAG. CC (Claude) owns the backend plumbing: Kraken MCP integration, EIP-712 TradeIntents, Surge API, and BFT Validation ERC-8004 minting to Base Sepolia upon SHOFET vetoes.
5. PWA MOBILE CONTROLLER — what is actually live right now at app.aitrinitysymphony.com vs what is not done: The domain app.aitrinitysymphony.com is completely unresponsive/timing out; the PWA mobile controller is NOT DONE and not live.
6. /trade ROUTE — is trustrails.dev/trade live or not: No.
7. /.well-known/agent-registration.json — is this deployed or not: No.
8. CAN I SELF-REPORT BUILD FAILURES to escalation_log: Yes, I can use the supabase client in node scripts to insert records directly into the escalation_log table if I have service role access.`;

const record = {
  from_ai: 'gemini',
  to_ai: 'claude',
  subject: 'RE: ARCHITECTURE QUESTION — Gemini ground truth',
  content: content,
  priority: 95,
  requires_response: false,
  sprint: 'architecture-review'
};

async function run() {
  const { error } = await supabase.from('ai_dispatch').insert([record]);
  if (error) {
    console.error("SQL Error:", error);
  } else {
    console.log("SQL execution succeeded via Supabase API!");
  }
}
run();
