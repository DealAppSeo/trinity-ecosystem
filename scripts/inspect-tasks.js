
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://qnnpjhlxljtqyigedwkb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5Mzk1OTEsImV4cCI6MjA2NzUxNTU5MX0.6oG2DU_BD1uBnBrDoQFauvN1ZnkKo2ywkuwY-tPaQFw';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function inspectTasks() {
    console.log('Checking pending tasks...');
    const { data: pending, error } = await supabase
        .from('trinity_tasks')
        .select('*')
        .eq('status', 'pending');

    if (error) {
        console.error('Error:', error);
    } else {
        console.log(`Found ${pending.length} pending tasks.`);
        if (pending.length > 0) {
            console.log('Sample Task:', pending[0]);
        }
    }
}

inspectTasks();
