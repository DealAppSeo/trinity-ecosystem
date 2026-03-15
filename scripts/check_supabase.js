
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTables() {
    const tables = [
        'trinity_signals',
        'hdm_patterns',
        'gcm_outreach_queue',
        'torch_insights',
        'x402_receipts',
        'trustshell_waitlist',
        'trinity_agent_logs'
    ];

    const results = {};

    for (const table of tables) {
        try {
            const { count, error } = await supabase
                .from(table)
                .select('*', { count: 'exact', head: true })
                .filter('created_at', 'gte', '2026-03-08T23:00:00Z');

            if (error) {
                results[table] = { error: error.message };
            } else {
                const { data: latest } = await supabase
                    .from(table)
                    .select('created_at')
                    .order('created_at', { ascending: false })
                    .limit(1);

                results[table] = {
                    overnight_count: count || 0,
                    latest_entry: latest?.[0]?.created_at || 'None'
                };
            }
        } catch (e) {
            results[table] = { error: e.message };
        }
    }

    console.log('SUPABASE_REPORT_START');
    console.log(JSON.stringify(results, null, 2));
    console.log('SUPABASE_REPORT_END');
}

checkTables();
