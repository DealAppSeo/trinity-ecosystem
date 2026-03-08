import { supabaseAdmin as supabase } from '../lib/supabase';

async function main() {
    console.log("🛠️ Creating Gateway Observability tables...");

    // 1. Helicone Logs for Reasoning Evidence
    const { error: heliconeError } = await supabase.rpc('execute_sql', {
        sql_query: `
            CREATE TABLE IF NOT EXISTS helicone_logs (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                session_id UUID REFERENCES wisdom_sessions(id),
                agent_name TEXT NOT NULL,
                model TEXT NOT NULL,
                tokens_used INTEGER,
                cost_usd FLOAT,
                latency_ms INTEGER,
                reasoning_chain JSONB,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `
    });

    if (heliconeError) {
        console.error("❌ Failed to create helicone_logs:", heliconeError.message);
    } else {
        console.log("✅ Helicone Logs table ready.");
    }

    // 2. [MAINTENANCE] Update wisdom_sessions for minority opinions
    console.log("🛠️ Updating wisdom_sessions schema...");
    // Note: We'll assume the columns we added in the previous script are enough,
    // but we can add more if needed here.
}

main().catch(console.error);
