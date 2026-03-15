import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });


async function checkArtifacts() {
    console.log('🔍 Checking for artifacts...');

    // Dynamic import to ensure dotenv.config() has run
    const { supabase } = await import('../../lib/supabase');

    const { data: artifacts, error } = await supabase
        .from('trinity_artifacts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error('❌ Error fetching artifacts:', error.message);
        return;
    }

    if (!artifacts || artifacts.length === 0) {
        console.log('⚠️ No artifacts found.');
    } else {
        console.log(`✅ Found ${artifacts.length} recent artifacts:`);
        artifacts.forEach(a => {
            console.log(`- [${a.artifact_type}] ${a.title} (by ${a.creator_agent})`);
            console.log(`  🔗 ID: ${a.id} at ${a.created_at}`);
        });
    }
}

checkArtifacts();
