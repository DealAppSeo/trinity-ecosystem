
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: 'c:/Users/Cash4/OneDrive/Desktop/trinity-ecosystem/hyperdag-sandbox/.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function seedTestTask() {
    const task = {
        title: "Swarm Empowerment Verification Mission",
        description: "Verify the integration of the new MCP tools by performing the following: 1. Create a logic flow in Miro for the 'Trinity Wisdom' base. 2. Log the project start in Airtable 'Strategic Backlog'. 3. Search and summarize existing agent documentation in Document360. 4. Output a summary artifact.",
        priority: 5,
        status: "todo",
        assigned_to: "ORCHESTRATOR",
        tags: ["internal", "verification", "mcp"]
    };

    const { data, error } = await supabase
        .from('trinity_tasks')
        .insert([task])
        .select();

    if (error) {
        console.error('❌ Error seeding test task:', error.message);
    } else {
        console.log('🚀 Seeding Test Mission complete:', data[0].id);
    }
}

seedTestTask();
