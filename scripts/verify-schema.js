
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://qnnpjhlxljtqyigedwkb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5Mzk1OTEsImV4cCI6MjA2NzUxNTU5MX0.6oG2DU_BD1uBnBrDoQFauvN1ZnkKo2ywkuwY-tPaQFw';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function verify() {
    console.log('Checking for trinity_artifacts table...');
    const { data, error, count } = await supabase
        .from('trinity_artifacts')
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error('Error checking trinity_artifacts:', error.message);
    } else {
        console.log(`Found trinity_artifacts table with ${count} entries.`);
    }

    console.log('\nChecking trinity_retros...');
    const { count: retroCount } = await supabase
        .from('trinity_retros')
        .select('*', { count: 'exact', head: true });
    console.log(`Found trinity_retros entries: ${retroCount}`);

    console.log('\nChecking Storage Buckets...');
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    if (bucketError) console.log('Bucket Error:', bucketError.message);
    else console.log('Buckets:', buckets?.map(b => b.name));
}

verify();
