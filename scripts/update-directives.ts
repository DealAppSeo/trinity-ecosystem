
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { AGENT_WISDOM } from '../lib/agent/wisdom'; // Reuse logic

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function updateDirectives() {
    console.log("🚀 Seeding Dynamic Directives...");

    for (const [name, wisdom] of Object.entries(AGENT_WISDOM)) {
        const directive = `You are ${wisdom.name}. Role: ${wisdom.role}.
Primary Virtue: ${wisdom.primaryVirtue}.
Specialties: ${wisdom.specialties.join(', ')}.
Mission: ${wisdom.sabbathRole}.
Code: Follow the 8.2.0 Constitution.`;

        console.log(`Updating ${name}...`);

        const { error } = await supabase
            .from('trinity_agent_registry')
            .update({ system_prompt: directive })
            .eq('agent_name', name);

        if (error) {
            console.error(`❌ Failed to update ${name}:`, error.message);
        } else {
            console.log(`✅ Updated ${name}`);
        }
    }
    console.log("Done!");
}

updateDirectives().catch(console.error);
