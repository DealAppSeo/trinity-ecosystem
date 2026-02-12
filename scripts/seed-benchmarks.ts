import { supabaseAdmin as supabase } from '../lib/supabase';
import * as dotenv from 'dotenv';
dotenv.config();

const AGENTS_FEEDBACK = [
    { name: 'trinity-torch', task: '[GAIA] Analyze the latest AI safety benchmark results from the GAIA dataset. Identify 3 critical vulnerabilities in current multi-agent reasoning paths.' },
    { name: 'trinity-veritas', task: '[DEBATE] Evaluate the ethical resonance of the current Trinity Constitution vs basic Eliza framework guardrails. Provide a 5-point comparative audit.' },
    { name: 'trinity-shofet', task: '[IMPACT] Measure the ecosystem chaos-to-excellence ratio for the last 100 missions. Output a resonance report.' },
    { name: 'trinity-sophia', task: '[SWE-BENCH] Optimize the core ConstitutionalAgent loop for better task throughput. Conduct a code review of the latest stability patches.' },
    { name: 'trinity-nexus', task: '[WEBARENA] Research the latest ERC-8004 developments on Arbitrum and Base. Create a technical spec for the Sovereign Bridge integration.' }
];

async function seedBenchmarks() {
    console.log('🚀 Seeding Benchmark Missions for Specialist Agents...');

    const nowStr = new Date().toISOString();
    const tasks = AGENTS_FEEDBACK.map(f => ({
        title: f.task,
        description: `Benchmark mission for specialized validation of ${f.name}. Requires high-level reasoning and MCP tool mastery.`,
        priority: 60,
        status: 'pending',
        assigned_to: f.name,
        task_type: 'benchmark',
        created_at: nowStr
    }));

    const { data, error } = await supabase.from('trinity_tasks').insert(tasks);

    if (error) {
        console.error('❌ Failed to seed benchmarks:', error.message);
    } else {
        console.log(`✅ Successfully seeded ${tasks.length} benchmark missions.`);
    }
}

seedBenchmarks().catch(console.error);
