import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function checkTables() {
  console.log('🔍 Checking Supabase Tables...');

  const tables = ['trinity_retros', 'trinity_research_log'];

  for (const table of tables) {
    const { error } = await supabase.from(table).select('count', { count: 'exact', head: true });
    if (error && error.code === '42P01') {
      console.error(`❌ Table '${table}' DOES NOT EXIST.`);
    } else if (error) {
      console.error(`⚠️ Error checking '${table}':`, error.message);
    } else {
      console.log(`✅ Table '${table}' exists and is actionable.`);
    }
  }
}

checkTables();
