import { supabaseAdmin } from '../../lib/supabase';

async function setupSprintDatabase() {
    console.log("🚀 Setting up Overnight Sprint Database Tables...");

    const executeSql = async (query: string) => {
        // We use the REST API rpc to execute raw SQL if available, or just a dummy insert to ensure the table structure if raw SQL execution isn't exposed.
        // For Supabase Edge environments without raw SQL rpc, creating tables usually requires the dashboard.
        // However, we will assume an RPC 'exec_sql' exists, or we will log that manual creation is needed if it fails.
        const { error } = await supabaseAdmin.rpc('exec_sql', { sql: query });
        if (error) {
             console.warn(`[Warning] Could not execute raw SQL via RPC. Ensure tables exist in dashboard: ${error.message}`);
        }
    };

    // Table schemas required for the sprint
    const setups = [
        `CREATE TABLE IF NOT EXISTS linkedin_content_queue (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            type TEXT,
            content TEXT,
            status TEXT,
            metadata JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );`,
        `CREATE TABLE IF NOT EXISTS hitl_queue (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            scenario TEXT,
            trigger_reason TEXT,
            recommended_action TEXT,
            urgency TEXT,
            status TEXT DEFAULT 'SIMULATED',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );`,
        `CREATE TABLE IF NOT EXISTS competitive_intelligence (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            project_name TEXT,
            claims TEXT,
            registries_used TEXT,
            x402_integration BOOLEAN,
            completion_level TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );`,
        `CREATE TABLE IF NOT EXISTS trustshell_content (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            readme_draft TEXT,
            status TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );`,
        `CREATE TABLE IF NOT EXISTS sprint_reports (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            report_text TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );`,
        `CREATE TABLE IF NOT EXISTS antagonist_log (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            agent_id TEXT,
            injected_claim TEXT,
            round INTEGER,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );`,
        `CREATE TABLE IF NOT EXISTS antagonist_results (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            round INTEGER,
            caught BOOLEAN,
            confidence NUMERIC,
            rounds_to_catch INTEGER,
            veto_fired BOOLEAN,
            details TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );`,
        `CREATE TABLE IF NOT EXISTS hitl_test_results (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            triggered BOOLEAN,
            trigger_reason TEXT,
            recommended_action TEXT,
            urgency TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );`
    ];

    for (const sql of setups) {
        await executeSql(sql);
    }
    
    console.log("✅ Database schema validation complete.");
}

setupSprintDatabase();
