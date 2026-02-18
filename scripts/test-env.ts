import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
console.log('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log('SUPABASE_ANON_KEY AVAILABLE:', !!process.env.SUPABASE_ANON_KEY);
console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY AVAILABLE:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
console.log('SERVICE_ROLE_KEY AVAILABLE:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
