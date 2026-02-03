
import * as dotenv from 'dotenv';
dotenv.config({ path: 'c:/Users/Cash4/OneDrive/Desktop/trinity-ecosystem/hyperdag-sandbox/.env.local' });
console.log('--- ENV TEST ---');
console.log('SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'OK' : 'MISSING');
console.log('AIRTABLE_KEY:', process.env.AIRTABLE_API_KEY ? 'OK' : 'MISSING');
console.log('--- END TEST ---');
