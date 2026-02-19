
import { supabase } from '../lib/supabase';

async function checkAgentLogs() {
    console.log("🔍 Fetching Recent Agent Logs (Last 50)...");

    const { data: logs, error } = await supabase
        .from('trinity_agent_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) {
        console.error("❌ Error fetching logs:", error.message);
        return;
    }

    if (!logs || logs.length === 0) {
        console.log("⚠️ No logs found.");
    } else {
        logs.forEach(log => {
            const time = new Date(log.created_at).toLocaleTimeString();
            const name = log.agent_name || log.agent || 'unknown';
            const level = log.log_level || log.action || 'info';
            const msg = log.message || log.content || log.log_message || '';
            console.log(`[${time}] [${name}] [${level}]: ${msg}`);
        });
    }
}

checkAgentLogs();
