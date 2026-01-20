import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    console.log("🛠️ Inspecting Triggers and Constraints...");

    // Check if trinity_stats exists by trying to select from it
    const { error: statsError } = await supabase.from('trinity_stats').select('*').limit(1);
    console.log(`- trinity_stats table check: ${statsError ? '❌ Error: ' + statsError.message : '✅ Exists'}`);

    // Check artifacts
    const { data: latestArtifacts } = await supabase.from('trinity_artifacts').select('title, created_at').order('created_at', { ascending: false }).limit(5);
    console.log("- Latest Artifacts in DB:");
    latestArtifacts?.forEach(a => console.log(`  - ${a.title} (${a.created_at})`));
}

inspect();
