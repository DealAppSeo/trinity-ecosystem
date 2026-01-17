
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function debugArtifacts() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('--- Fetching all artifact types ---');
    const { data: allTypes, error } = await supabase.from('trinity_artifacts').select('artifact_type');

    if (error) {
        console.error('Error:', error);
        return;
    }

    const counts: Record<string, number> = {};
    allTypes?.forEach(a => {
        const t = a.artifact_type || 'undefined';
        counts[t] = (counts[t] || 0) + 1;
    });

    console.log('--- Artifact Type Distribution ---');
    console.log(JSON.stringify(counts, null, 2));

    console.log('\n--- Sample Artifacts (Title and Type) ---');
    const { data: sample } = await supabase
        .from('trinity_artifacts')
        .select('title, artifact_type, access_level, content')
        .limit(5);

    // Snip content for display
    const cleanedSample = sample?.map(s => ({
        ...s,
        content: s.content ? s.content.substring(0, 50) + '...' : null
    }));

    console.log(JSON.stringify(cleanedSample, null, 2));
}

debugArtifacts();
