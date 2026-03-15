
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: 'c:/Users/Cash4/OneDrive/Desktop/trinity-ecosystem/trinity-ecosystem/.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStatus() {
  const { data: agents } = await supabase.from('trinity_agent_registry').select('*').order('agent_name');
  const { data: logs } = await supabase.from('trinity_agent_logs').select('*').order('created_at', { ascending: false }).limit(5);
  const { data: tasks } = await supabase.from('trinity_tasks').select('*').order('created_at', { ascending: false }).limit(5);

  console.log(JSON.stringify({ agents, logs, tasks }, null, 2));
}

checkStatus();
