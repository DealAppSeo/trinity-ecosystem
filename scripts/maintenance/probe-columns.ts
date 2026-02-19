import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function probeColumns() {
    const columns = ['message', 'content', 'log_message', 'text', 'body', 'data'];
    const agentColumns = ['agent', 'agent_name'];

    console.log("🔍 Probing for correct column names in trinity_agent_logs...");

    for (const agentCol of agentColumns) {
        for (const col of columns) {
            try {
                const payload = { [agentCol]: 'Antigravity', [col]: 'Probe Test' };
                const { error } = await supabase.from('trinity_agent_logs').insert(payload);

                if (!error) {
                    console.log(`✅ SUCCESS! Table accepts: { "${agentCol}", "${col}" }`);
                    return;
                } else {
                    if (error.message.includes('column') && error.message.includes('does not exist')) {
                        // Keep trying
                    } else {
                        console.log(`❌ Error for { "${agentCol}", "${col}" }: ${error.message}`);
                    }
                }
            } catch (e: any) {
                // ignore
            }
        }
    }
    console.log("❌ All probes failed.");
}

probeColumns();
