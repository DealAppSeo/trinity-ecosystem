import { supabaseAdmin as supabase } from '../lib/supabase';

async function main() {
    console.log("🛠️ Creating Evergreen Infrastructure tables...");

    const queries = [
        `CREATE TABLE IF NOT EXISTS trinity_agent_logs (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            agent_name TEXT NOT NULL,
            cycle_start TIMESTAMPTZ,
            cycle_end TIMESTAMPTZ,
            tasks_completed INTEGER DEFAULT 0,
            errors TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );`,
        `CREATE TABLE IF NOT EXISTS trinity_signals (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            source TEXT,
            signal_type TEXT,
            data JSONB,
            confidence FLOAT,
            verified BOOLEAN DEFAULT false,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );`,
        `CREATE TABLE IF NOT EXISTS hdm_patterns (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            pattern_type TEXT,
            description TEXT,
            accuracy FLOAT,
            active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );`,
        `CREATE TABLE IF NOT EXISTS chesed_care_flags (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            interaction_id UUID,
            issue_type TEXT,
            urgency TEXT,
            notified BOOLEAN DEFAULT false,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );`,
        `CREATE TABLE IF NOT EXISTS gcm_content_queue (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            source TEXT,
            content_url TEXT,
            relevance_score FLOAT,
            Sean_reviewed BOOLEAN DEFAULT false,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );`,
        `CREATE TABLE IF NOT EXISTS torch_insights (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            title TEXT,
            content TEXT,
            pushed_to_telegram BOOLEAN DEFAULT false,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );`,
        `CREATE TABLE IF NOT EXISTS apm_performance (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            portfolio_value FLOAT,
            drawdown FLOAT,
            timestamp TIMESTAMPTZ DEFAULT NOW()
        );`
    ];

    for (const sql_query of queries) {
        const { error } = await supabase.rpc('execute_sql', { sql_query });
        if (error) {
            console.error(`❌ Failed to execute: ${sql_query.substring(0, 50)}...`, error.message);
        }
    }

    console.log("✅ Evergreen tables ready.");
}

main().catch(console.error);
