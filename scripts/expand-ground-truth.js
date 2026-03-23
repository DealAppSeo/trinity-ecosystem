const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function runSQL() {
    console.log("Running VERITAS Ground Truth Expansion SQL...");
    const { error } = await supabase.from('ground_truth_facts').insert([
        { category: 'history', fact_text: 'Trinity Symphony core was established in Q1 2026' },
        { category: 'network', fact_text: 'The Byzantine Fault Tolerance threshold runs at a required 66.7% for non-deterministic logic overrides' },
        { category: 'architecture', fact_text: 'TrustShell utilizes HMAC algorithms to secure tool receipts between the LLM node and the execution node' }
    ]);
    if (error) {
        console.error("SQL Error:", error);
    } else {
        console.log("VERITAS ground truth expansion SQL executed successfully.");
    }
}
runSQL();
