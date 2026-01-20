
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!url || !key) {
    console.error('❌ Missing SUPABASE_URL or SERVICE_ROLE_KEY. Check .env.local');
    process.exit(1);
}

const supabase = createClient(url, key);

async function checkTable(tableName: string, requiredColumns: string[]) {
    console.log(`\n🔍 Auditing table: ${tableName}`);
    const { data: sample, error } = await supabase.from(tableName).select('*').limit(1);

    if (error) {
        console.error(`  ❌ Error querying ${tableName}:`, error.message);
        return;
    }

    if (sample && sample.length > 0) {
        const columns = Object.keys(sample[0]);
        requiredColumns.forEach(id => {
            if (columns.includes(id)) {
                console.log(`  ✅ Column '${id}' found.`);
            } else {
                console.warn(`  ⚠️ Column '${id}' is MISSING!`);
            }
        });
    } else {
        console.log(`  ℹ️ Table ${tableName} is empty, cannot verify columns.`);
    }
}

async function runAudit() {
    await checkTable('trinity_artifacts', ['id', 'title', 'artifact_type', 'creator_agent', 'status']);
    await checkTable('trinity_tasks', ['id', 'status', 'verify_count']);
    await checkTable('trinity_agent_registry', ['agent_name', 'reputation_score', 'squad', 'status']);
    console.log('\n✅ Audit complete.');
}

runAudit();
