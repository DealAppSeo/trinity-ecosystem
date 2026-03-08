import { supabaseAdmin as supabase } from '../lib/supabase';

async function main() {
    console.log("🛠️ Creating x402 and TrustShell tables...");

    const queries = [
        `CREATE TABLE IF NOT EXISTS x402_receipts (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            agent_id TEXT NOT NULL,
            amount FLOAT NOT NULL,
            tx_hash TEXT,
            action_type TEXT,
            timestamp TIMESTAMPTZ DEFAULT NOW(),
            metadata JSONB
        );`,
        `CREATE TABLE IF NOT EXISTS trustshell_waitlist (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            email TEXT NOT NULL UNIQUE,
            agent_type TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );`,
        `CREATE TABLE IF NOT EXISTS veritas_competitive_log (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            package_name TEXT,
            score FLOAT,
            notes TEXT,
            timestamp TIMESTAMPTZ DEFAULT NOW()
        );`,
        `CREATE TABLE IF NOT EXISTS gcm_outreach_queue (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            github_url TEXT,
            stars INTEGER,
            contact_info TEXT,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMPTZ DEFAULT NOW()
        );`
    ];

    for (const sql_query of queries) {
        const { error } = await supabase.rpc('execute_sql', { sql_query });
        if (error) {
            console.error(`❌ Failed to execute: ${sql_query.substring(0, 50)}...`, error.message);
        }
    }

    console.log("✅ Tables ready.");
}

main().catch(console.error);
