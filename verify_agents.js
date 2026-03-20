const { createClient } = require('@supabase/supabase-js');
const url = 'https://qnnpjhlxljtqyigedwkb.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTkzOTU5MSwiZXhwIjoyMDY3NTE1NTkxfQ.4ADAiDK-CD6Jk5_JgizadriWVBoYg42NnsKsbcQ0h6A';
const sb = createClient(url, key);

async function run() {
    const { data: logs, error } = await sb.from('trinity_agent_logs')
        .select('*')
        .gt('created_at', new Date(Date.now() - 30 * 60000).toISOString());
    
    if (error) { console.error(error); return; }
    const agents = [...new Set(logs.map(l => l.agent_name || l.agent_id))].filter(Boolean);
    console.log("Distinct Agents:", agents);
    
    const allCaps = agents.filter(a => a && !a.startsWith('trinity-') && a === a.toUpperCase());
    const prefixed = agents.filter(a => a && a.startsWith('trinity-'));
    
    console.log(`\nALL-CAPS Agents: ${allCaps.length}`);
    console.log(`Prefixed Agents: ${prefixed.length} (${prefixed.join(', ')})`);
}
run();
