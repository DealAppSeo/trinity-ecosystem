const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

async function main() {
    const { data: tasks, error } = await s.from('trinity_tasks')
        .select('id, title, description, belief, disbelief, uncertainty, result, metadata')
        .eq('task_type', 'hallucination_detection')
        .eq('status', 'done')
        .not('belief', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error("Fetch Error:", error);
        return;
    }

    const transformed = tasks.map(t => ({
        id: t.id,
        title: t.title,
        claim: t.description ? t.description.substring(0, 100) : null,
        belief: t.belief,
        disbelief: t.disbelief,
        uncertainty: t.uncertainty,
        result_preview: t.result ? String(t.result).substring(0, 200) : null,
        metadata: t.metadata
    }));

    require('fs').writeFileSync('scripts/debug-llm-catch.json', JSON.stringify(transformed, null, 2));
}
main();
