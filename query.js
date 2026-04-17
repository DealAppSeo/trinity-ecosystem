const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim() || envContent.match(/SUPABASE_URL=(.*)/)?.[1]?.trim();
const envKey = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim() || envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();

const supabase = createClient(envUrl, envKey);

async function run() {
  const tenMinsAgo = new Date(Date.now() - 10 * 60000).toISOString();
  const { data, error } = await supabase
    .from('trinity_tasks')
    .select('id, title, agent_assigned, status, created_at')
    .gte('created_at', tenMinsAgo)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
  } else {
    data.forEach(d => {
      console.log(`id: ${d.id}`);
      console.log(`title: ${d.title}`);
      console.log(`agent_assigned: ${d.agent_assigned}`);
      console.log(`status: ${d.status}`);
      console.log(`created_at: ${d.created_at}`);
      console.log('---');
    });
  }
}

run();
