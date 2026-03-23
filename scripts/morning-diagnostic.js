const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function runDiagnostics() {
    console.log("=== 0. MORNING DIAGNOSTIC ===");
    const { data: diagData, error: diagError } = await supabase.from('trinity_tasks').select('agent_assigned, status, created_at')
        .in('status', ['completed', 'done'])
        .gte('created_at', new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString());
        
    if (diagData) {
        const counts = {};
        for(let d of diagData) {
            counts[d.agent_assigned] = (counts[d.agent_assigned] || 0) + 1;
        }
        console.log(Object.entries(counts).sort((a,b) => b[1] - a[1]));
    }

    console.log("=== 5. ACTION REMAINING TASKS ===");
    const specificTitles = [
        'RepID scoring formula design - variable weighted decay with multipliers',
        'Three-tier agent identity system - prior art and patent landscape',
        'APEX DB - Adaptive Privacy-preserving Extensible Database research',
        'Hackathon submission description - final copy',
        'TrustShell taglines and positioning variants',
        'Web3 onboarding friction analysis and TrustShell solution',
        'ScyllaDB architecture research',
        'ANFIS LASSO bilateral learning design',
        'latency as opportunity routing design',
        'antifragile architecture patterns'
    ];
    
    for (let title of specificTitles) {
        const { data, error } = await supabase.from('trinity_tasks')
            .select('agent_assigned, title, result')
            .in('status', ['completed', 'done'])
            .eq('title', title)
            .gte('created_at', new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString())
            .limit(1);
            
        if (data && data.length > 0) {
            const t = data[0];
            const safeTitle = t.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const filename = path.join(__dirname, '..', 'sprint_results', `${safeTitle}.md`);
            const content = `# ${t.title}\n\n**Agent:** ${t.agent_assigned}\n\n## Preview\n${t.result ? t.result.substring(0, 1000) : ''}\n\n## Full Result\n${t.result}`;
            fs.writeFileSync(filename, content);
            console.log(`Saved: ${filename}`);
        } else {
            console.log(`Not found: ${title}`);
        }
    }
}
runDiagnostics();
