import { supabaseAdmin as supabase } from '../../lib/supabase';
import fs from 'fs';
import path from 'path';

async function applyHallucinationLogsTable() {
    console.log('Applying hallucination logs table...');
    const sqlPath = path.resolve(process.cwd(), 'sql', '20240312_hallucination_logs.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    try {
        const { data, error } = await supabase.rpc('exec_sql', { query: sql });
        
        if (error) {
            console.log('Switching to sequential command execution...');
            const commands = sql.split(';').filter(c => c.trim().length > 0);
            for (const cmd of commands) {
                console.log(`Running: ${cmd.substring(0, 50)}...`);
                const { error: cmdError } = await supabase.rpc('exec_sql', { query: cmd });
                if (cmdError) console.error('Command Error:', cmdError.message);
            }
        } else {
            console.log('SQL applied successfully:', data);
        }
    } catch (e: any) {
        console.error('Migration failed:', e.message);
    }
}

applyHallucinationLogsTable();
