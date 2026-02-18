
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env.local');
let env = {};
if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) env[key.trim()] = value.trim();
    });
}

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'] || 'https://qnnpjhlxljtqyigedwkb.supabase.co';
const supabaseKey = env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5Mzk1OTEsImV4cCI6MjA2NzUxNTU5MX0.6oG2DU_BD1uBnBrDoQFauvN1ZnkKo2ywkuwY-tPaQFw';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMissions() {
    console.log('--- TOP 20 RECENTLY UPDATED TASKS ---');

    const { data: tasks, error } = await supabase
        .from('trinity_tasks')
        .select('id, title, status, claimed_by, updated_at')
        .order('updated_at', { ascending: false })
        .limit(20);

    if (error) {
        console.error('Error fetching tasks:', error.message);
    } else if (tasks && tasks.length > 0) {
        tasks.forEach(t => {
            console.log(`[${t.updated_at}] [${t.status.toUpperCase()}] ${t.claimed_by || 'None'}: ${t.title}`);
        });
    }

    console.log('\n--- TOP 20 RECENT ARTIFACTS ---');
    const { data: artifacts, error: artError } = await supabase
        .from('trinity_artifacts')
        .select('id, title, creator_agent, created_at')
        .order('created_at', { ascending: false })
        .limit(20);

    if (artError) {
        console.error('Error fetching artifacts:', artError.message);
    } else if (artifacts && artifacts.length > 0) {
        artifacts.forEach(a => {
            console.log(`[${a.created_at}] [${a.creator_agent}] Artifact: ${a.title}`);
        });
    }
}

checkMissions();
