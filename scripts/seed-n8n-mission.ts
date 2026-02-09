
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const N8N_MISSION = {
    title: '[AUTOMATION] [SCOUT] n8n-Trinity Integration Audit',
    description: `Perform a deep audit of the new N8NMCP bridge. 
    
    Directives:
    1. Use N8NMCP to list available workflows (if API key is present).
    2. Propose 3 "High-Impact" workflows that Trinity agents should use to automate ecosystem maintenance (e.g., Automatic Railway Secret Rotation via n8n).
    3. Document the private networking advantages of self-hosting n8n on Railway.
    4. Artifact: n8n_Integration_Audit.md`,
    task_type: 'research',
    priority: 95,
    assigned_to: 'trinity-sophia'
};

async function seedN8N() {
    console.log('🚀 Seeding n8n Automation mission...');

    const { data, error } = await supabase
        .from('trinity_tasks')
        .insert([{
            ...N8N_MISSION,
            status: 'pending',
            created_at: new Date().toISOString()
        }]);

    if (error) {
        console.error(`❌ Error seeding ${N8N_MISSION.title}:`, error.message);
    } else {
        console.log(`✅ Seeded: ${N8N_MISSION.title}`);
    }

    console.log('🏁 n8n seeding complete.');
}

seedN8N();
