
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

async function verifyPhase_4_75() {
    console.log('🔍 Starting Phase 4.75 Verification (Primary Source Alignment)...\n');

    const supabase = createClient(
        'https://qnnpjhlxljtqyigedwkb.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5Mzk1OTEsImV4cCI6MjA2NzUxNTU5MX0.6oG2DU_BD1uBnBrDoQFauvN1ZnkKo2ywkuwY-tPaQFw'
    );

    // 1. Files Verification
    const filesToCheck = [
        'lib/agent/ConstitutionalAgent.ts',
        'middleware.ts',
        'app/agents/[agentId]/registration.json/route.ts',
        'app/.well-known/erc-8004.json/route.ts',
        'lib/reputation/giveFeedback.ts',
        'scripts/agentcards/generate_agent_cards.js',
        'scripts/agentcards/register_agents.ts'
    ];

    console.log('--- 📂 Files Verification ---');
    for (const f of filesToCheck) {
        const fullPath = path.join(process.cwd(), f);
        if (fs.existsSync(fullPath)) {
            console.log(`✅ File exists: ${f}`);
        } else {
            console.error(`❌ File MISSING: ${f}`);
        }
    }

    // 2. Database Schema Verification
    console.log('\n--- 🗄️ Database Schema Verification ---');
    const tablesQuery = `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('agent_repid_history', 'payment_log', 'agent_registry');
    `;

    try {
        const { data, error } = await supabase.rpc('exec_sql', { query: tablesQuery });
        if (error) throw error;

        const existingTables = data.map(t => t.table_name);
        ['agent_repid_history', 'payment_log', 'agent_registry'].forEach(t => {
            if (existingTables.includes(t)) {
                console.log(`✅ Table exists: ${t}`);
            } else {
                console.error(`❌ Table MISSING: ${t}`);
            }
        });
    } catch (e) {
        console.error('❌ Schema verification failed:', e.message);
    }

    // 3. Logic Verification (Grep Patterns)
    console.log('\n--- 🧠 Logic Verification (Patterns) ---');
    const agentContent = fs.readFileSync(path.join(process.cwd(), 'lib/agent/ConstitutionalAgent.ts'), 'utf8');
    const middlewareContent = fs.readFileSync(path.join(process.cwd(), 'middleware.ts'), 'utf8');

    if (agentContent.includes('computeRepIDThreshold')) console.log('✅ Found computeRepIDThreshold in ConstitutionalAgent');
    if (agentContent.includes('pythagoreanCommaVeto')) console.log('✅ Found pythagoreanCommaVeto in ConstitutionalAgent');
    if (agentContent.includes('getAutonomyTier')) console.log('✅ Found getAutonomyTier in ConstitutionalAgent');
    if (agentContent.includes('PAYMENT-SIGNATURE')) console.log('✅ Found x402 V2 Header in ConstitutionalAgent');

    if (middlewareContent.includes('PAYMENT-SIGNATURE')) console.log('✅ Found x402 V2 Header in middleware.ts');
    if (middlewareContent.includes('isX402Route')) console.log('✅ Found x402 RepID Guard in middleware.ts');

    console.log('\n🏁 Phase 4.75 Verification Complete.');
}

verifyPhase_4_75().catch(console.error);
