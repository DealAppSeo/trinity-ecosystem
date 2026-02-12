
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testFetch() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qnnpjhlxljtqyigedwkb.supabase.co';
    console.log('Testing fetch to:', url);
    try {
        const res = await fetch(`${url}/rest/v1/trinity_agent_registry?limit=1`, {
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY || ''
            }
        });
        console.log('Status:', res.status);
        console.log('Status Text:', res.statusText);
        const data = await res.json();
        console.log('Data found:', !!data);
    } catch (e: any) {
        console.error('Fetch Failed:', e.message);
    }
}

testFetch();
