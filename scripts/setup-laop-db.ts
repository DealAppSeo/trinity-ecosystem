import { supabaseAdmin as supabase } from '../lib/supabase';

async function main() {
    console.log("🛠️ Creating LAOP Engagements table...");

    const { error } = await supabase.rpc('execute_sql', {
        sql_query: `
            CREATE TABLE IF NOT EXISTS laop_engagements (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                query TEXT NOT NULL,
                engagement_question TEXT,
                user_response TEXT,
                final_answer TEXT,
                quality_score FLOAT,
                background_tasks_count INTEGER DEFAULT 0,
                latency_ms INTEGER,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `
    });

    if (error) {
        console.error("❌ Failed to create table:", error.message);
        // Fallback: If rpc execute_sql isn't enabled, just log it.
        console.log("Tip: Please create the table 'laop_engagements' manually in the Supabase Dashboard if this fails.");
    } else {
        console.log("✅ Table ready (or already existed).");
    }
}

main().catch(console.error);
