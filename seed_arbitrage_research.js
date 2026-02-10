
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const arbitrageTasks = [
    {
        title: '[RESEARCH] Arbitrage: AI Inference Price/Latency Matrix',
        description: 'Audit and compare real-time pricing and token-per-second performance for Llama 3.3 70B across Groq, Cerebras, DeepInfra, and Together AI. Identify the current arbitrage leader for high-throughput agents.',
        task_type: 'research',
        priority: 85,
        status: 'pending',
        assigned_to: 'trinity-veritas',
        metadata: { swarm_state: 'research', focus: 'intelligence-arbitrage' }
    },
    {
        title: '[RESEARCH] Arbitrage: High-End GPU Spot Pricing (H100/A100)',
        description: 'Research and aggregate current spot/on-demand pricing for H100 and A100 instances across Lambda Labs, Vast.ai, RunPod, and FluidStack. Create a cost-optimization roadmap for training local MoE models.',
        task_type: 'research',
        priority: 75,
        status: 'pending',
        assigned_to: 'trinity-torch',
        metadata: { swarm_state: 'research', focus: 'compute-arbitrage' }
    },
    {
        title: '[RESEARCH] Arbitrage: Vector Database Cost/Performance Analysis',
        description: 'Analyze the TCO (Total Cost of Ownership) for Pinecone, Weaviate Cloud, and self-hosted Qdrant on Railway for trillion-token swarm memories. Determine the point at which self-hosting becomes a net-positive arbitrage.',
        task_type: 'research',
        priority: 70,
        status: 'pending',
        assigned_to: 'trinity-axis',
        metadata: { swarm_state: 'research', focus: 'infrastructure-arbitrage' }
    },
    {
        title: '[RESEARCH] Arbitrage: Cross-Model Logic Efficiency (DeepSeek vs Kimi)',
        description: 'Evaluate the "Logic-per-Dollar" efficiency of DeepSeek-V3 vs Kimi-K2.5 for multi-step reasoning tasks. Use the thinking-mode benchmark to determine which model offers better arbitrage for complex architectural builds.',
        task_type: 'research',
        priority: 90,
        status: 'pending',
        assigned_to: 'trinity-veritas',
        metadata: { swarm_state: 'research', focus: 'logic-arbitrage', model_hint: 'kimi-k2.5' }
    }
];

async function seedTasks() {
    console.log('--- SEEDING ARBITRAGE RESEARCH MISSIONS ---');

    const { data, error } = await supabase
        .from('trinity_tasks')
        .insert(arbitrageTasks);

    if (error) {
        console.error('Error seeding tasks:', error.message);
    } else {
        console.log('Successfully seeded 4 arbitrage research missions.');
    }
}

seedTasks();
