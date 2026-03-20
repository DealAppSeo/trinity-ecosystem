const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://qnnpjhlxljtqyigedwkb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTkzOTU5MSwiZXhwIjoyMDY3NTE1NTkxfQ.4ADAiDK-CD6Jk5_JgizadriWVBoYg42NnsKsbcQ0h6A'
);

const terms = ['heterogeneous', 'antifragile', 'different entry points', 'agent isolation', 'start command variation', 'intentional agent diversity', 'diverse entry', 'isolated environments'];

async function search() {
  console.log('Searching Supabase tasks and logs...');
  const results = [];

  for (const term of terms) {
    // Search trinity_tasks
    const { data: tasks, error: tErr } = await supabase
      .from('trinity_tasks')
      .select('id, title, description')
      .or(`title.ilike.%${term}%,description.ilike.%${term}%`);
    
    if (tErr) console.error('Task error:', tErr);
    if (tasks && tasks.length > 0) {
      results.push(`Found "${term}" in ${tasks.length} tasks.`);
      tasks.forEach(t => results.push(`  Task [${t.id}] ${t.title}`));
    }

    // Search trinity_logs
    const { data: logs, error: lErr } = await supabase
      .from('trinity_logs')
      .select('id, event_type, message')
      .ilike('message', `%${term}%`)
      .limit(10);
      
    if (lErr) console.error('Log error:', lErr);
    if (logs && logs.length > 0) {
      results.push(`Found "${term}" in ${logs.length} logs.`);
      logs.forEach(l => results.push(`  Log [${l.id}] ${l.event_type}: ${l.message?.substring(0, 100)}`));
    }
  }

  if (results.length === 0) {
    console.log('No mentions found in Database.');
  } else {
    console.log(results.join('\n'));
  }
}

search();
