import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    'https://qnnpjhlxljtqyigedwkb.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTkzOTU5MSwiZXhwIjoyMDY3NTE1NTkxfQ.4ADAiDK-CD6Jk5_JgizadriWVBoYg42NnsKsbcQ0h6A'
);

const sprintTasks = [
    {
        title: '[GNN] [RESEARCH] Multiplicative GAT Architecture Spec',
        description: 'Design the PyTorch Geometric architecture for a Graph Attention Network that uses Geometric Mean (multiplication) for aggregation instead of addition. Reference Patent #2 claims.',
        priority: 95,
        assigned_to: 'trinity-nexus',
        task_type: 'research'
    },
    {
        title: '[BFT] [CODE] Merkle-DAG Bloom Filter Logic',
        description: 'Implement a helper function in HMASCoordinator.ts to generate and compare Bloom filters for Merkle-DAG state diffing between squad members.',
        priority: 95,
        assigned_to: 'trinity-veritas',
        task_type: 'code'
    },
    {
        title: '[DATA] [AUDIT] Subjective Logic Field Verification',
        description: 'Verify that all 12 agents in the 3x3+3 grid are correctly populating belief, disbelief, and uncertainty columns in the trinity_tasks table.',
        priority: 90,
        assigned_to: 'trinity-orch',
        task_type: 'audit'
    },
    {
        title: '[GNN] [MATH] Geometric Mean SQL Training Set',
        description: 'Create a view in Supabase that calculates the "Multiplicative Ground Truth" for task success based on agent history, to be used as training labels for the GNN.',
        priority: 85,
        assigned_to: 'trinity-hdm',
        task_type: 'infrastructure'
    }
];

async function seedSprint() {
    console.log('🚀 Seeding Patent Alignment Sprint (10-Day Accelerated)...');
    for (const task of sprintTasks) {
        const { error } = await supabase.from('trinity_tasks').insert({
            ...task,
            status: 'todo',
            metadata: { sprint: 'patent_alignment_v1', ai_accelerated: true }
        });
        if (error) console.error(`❌ Error seeding ${task.title}:`, error.message);
        else console.log(`✅ Seeded: ${task.title}`);
    }
}

seedSprint();
