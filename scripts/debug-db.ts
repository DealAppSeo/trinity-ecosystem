
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qnnpjhlxljtqyigedwkb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5Mzk1OTEsImV4cCI6MjA2NzUxNTU5MX0.6oG2DU_BD1uBnBrDoQFauvN1ZnkKo2ywkuwY-tPaQFw';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function debug() {
    console.log('🐞 Debugging Supabase Access...');

    // 1. Try INSERT
    console.log('Testing INSERT...');
    const { data: insertData, error: insertError } = await supabase
        .from('trinity_retros')
        .insert({
            agent: 'DEBUG_BOT',
            reflection: 'This is a test reflection.'
        })
        .select();

    if (insertError) {
        console.error('❌ INSERT FAILED:', insertError);
    } else {
        console.log('✅ INSERT SUCCESS:', insertData);
    }

    // 2. Try SELECT
    console.log('\nTesting SELECT...');
    const { data: selectData, error: selectError } = await supabase
        .from('trinity_retros')
        .select('*');

    if (selectError) {
        console.error('❌ SELECT FAILED:', selectError);
    } else {
        console.log(`✅ SELECT SUCCESS: Found ${selectData?.length} rows.`);
        if (selectData && selectData.length > 0) {
            console.log('Sample Row:', selectData[0]);
        }
    }
}

debug().catch(console.error);
