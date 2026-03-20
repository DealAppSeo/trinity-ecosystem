const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  'https://qnnpjhlxljtqyigedwkb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTkzOTU5MSwiZXhwIjoyMDY3NTE1NTkxfQ.4ADAiDK-CD6Jk5_JgizadriWVBoYg42NnsKsbcQ0h6A'
);

const terms = ['heterogeneous', 'antifragile', 'different entry points', 'agent isolation', 'start command variation', 'intentional agent diversity', 'diverse entry', 'isolated environments'];

async function search() {
  const summary = {};
  for (const term of terms) {
    const { count: tCount, error: tErr } = await supabase
      .from('trinity_tasks')
      .select('id', { count: 'exact' })
      .or(`title.ilike.%${term}%,description.ilike.%${term}%`);
    
    // We already know logs failed with 42P01
    summary[term] = { tasks: tCount || 0, error: tErr ? tErr.message : null };
  }
  fs.writeFileSync('db_counts.json', JSON.stringify(summary, null, 2));
}
search();
