
// @ts-nocheck
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

// Simple Scheduler to keep agents busy
// Runs every hour or continuously checks for idle state

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qnnpjhlxljtqyigedwkb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5Mzk1OTEsImV4cCI6MjA2NzUxNTU5MX0.6oG2DU_BD1uBnBrDoQFauvN1ZnkKo2ywkuwY-tPaQFw';

const supabase = createClient(supabaseUrl, supabaseKey);

// Ecosystem Targets for Continuous Optimization
const ECOSYSTEM_DOMAINS = [
    { name: 'PurposeHub.ai', url: 'https://purposehub.ai', focus: 'impact' },
    { name: 'ImageBearer.org', url: 'https://imagebearer.org', focus: 'impact' },
    { name: 'HyperDag.org', url: 'https://hyperdag.org', focus: 'tech' },
    { name: 'AISocialMirror.com', url: 'https://aisocialmirror.com', focus: 'truth_ux' },
    { name: 'AIDebate.io', url: 'https://aidebate.io', focus: 'truth' }
];

async function runScheduler() {
    console.log("🕰️  Trinity Scheduler Online. Monitoring Fleet Activity...");

    setInterval(async () => {
        const time = new Date().toLocaleTimeString();

        // 1. Monitor Queue Depth
        const { count, error } = await supabase
            .from('trinity_tasks')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');

        if (error) console.error("Scheduler Error:", error.message);

        console.log(`[${time}] Pending Tasks: ${count}`);

        // 2. Auto-Inject if Idle (Keep Busy Protocol)
        if (count === 0) {
            console.log("⚠️  Fleet is IDLE. Injecting Ecosystem Optimization Task...");

            // Pick random target
            const target = ECOSYSTEM_DOMAINS[Math.floor(Math.random() * ECOSYSTEM_DOMAINS.length)];

            // Construct Meaningful Task
            let title = `[ECOSYSTEM] ${target.name} Audit`;
            let desc = '';
            let type = 'research';
            let assignee = null;

            if (target.focus === 'truth') {
                title += ' - Truthfulness Check';
                desc = `Visit ${target.url}. Analyze the latest AI content. Verify 3 claims against external sources. Evaluate "Truthfulness". Save report.`;
                assignee = 'trinity-veritas';
            } else if (target.focus === 'impact') {
                title += ' - Impact Optimization';
                desc = `Analyze ${target.url} for user friction. How can we better "help people help people"? Propose 1 concrete feature.`;
                assignee = 'trinity-chesed';
            } else {
                title += ' - Tech & UX Audit';
                desc = `Review ${target.url}. Identify any broken flows or "Uncanny Valley" AI interactions. Suggest a "Wow" factor improvement.`;
                type = 'code';
            }

            await supabase.from('trinity_tasks').insert({
                title: title,
                description: desc,
                task_type: type,
                assigned_to: assignee,
                priority: 10, // Higher than nightly maintenance
                status: 'pending',
                created_at: new Date().toISOString(),
                requires_external_artifact: true,
                metadata: { tags: ['ecosystem', target.focus], benchmark: true }
            });
            console.log(`💉 Injected: ${title} -> ${assignee || 'General Pool'}`);
        }

    }, 60000); // Check every minute
}

runScheduler().catch(console.error);
