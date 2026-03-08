import { supabaseAdmin as supabase } from '../lib/supabase';

async function main() {
    console.log("🛠️ Creating Wisdom Sessions table...");

    const { error } = await supabase.rpc('execute_sql', {
        sql_query: `
            CREATE TABLE IF NOT EXISTS wisdom_sessions (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                query TEXT NOT NULL,
                agent_outputs JSONB NOT NULL DEFAULT '{}',
                lasso_weights JSONB NOT NULL DEFAULT '{}',
                dag_connections JSONB NOT NULL DEFAULT '[]',
                gnn_matches JSONB NOT NULL DEFAULT '[]',
                final_answer TEXT,
                epistemic_framing JSONB NOT NULL DEFAULT '{}',
                latency_ms INTEGER,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                metadata JSONB DEFAULT '{}'
            );
        `
    });

    if (error) {
        console.error("❌ Failed to create table via RPC:", error.message);
        console.log("\n⚠️ ACTION REQUIRED: Please copy-paste the following SQL into your Supabase SQL Editor:");
        console.log(`
-----------------------------------------------------------
-- WISDOM ENGINE MIGRATION
-----------------------------------------------------------
CREATE TABLE IF NOT EXISTS wisdom_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query TEXT NOT NULL,
    agent_outputs JSONB NOT NULL DEFAULT '{}',
    lasso_weights JSONB NOT NULL DEFAULT '{}',
    dag_connections JSONB NOT NULL DEFAULT '[]',
    gnn_matches JSONB NOT NULL DEFAULT '[]',
    final_answer TEXT,
    epistemic_framing JSONB NOT NULL DEFAULT '{}',
    latency_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);
-----------------------------------------------------------
        `);
        console.log("Tip: Please create the table 'wisdom_sessions' manually if this fails.");
    } else {
        console.log("✅ Wisdom Sessions table ready.");
    }
}

main().catch(console.error);
