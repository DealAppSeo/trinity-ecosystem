import { supabaseAdmin } from '../../lib/supabase';
import * as fs from 'fs';
import * as path from 'path';

async function run() {
    console.log("🚀 Executing semantic_cache.sql via Supabase RPC...");
    
    const sqlPath = path.join(__dirname, 'semantic_cache.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    // Split SQL by statements if needed, but exec_sql usually handles blocks if written properly
    // We'll execute it as one block first
    
    // Adding a quick check for 'exec_sql' RPC
    const { error, data } = await supabaseAdmin.rpc('exec_sql', { sql: sqlContent });
    
    if (error) {
        console.error("❌ Failed to execute SQL via RPC. Error:", error.message);
        
        // Sometimes the proxy RPC doesn't like massive single blocks, let's try statement by statement
        console.log("⚠️ Attempting statement by statement execution...");
        const statements = sqlContent
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);
            
        let hasErrors = false;
        for (const stmt of statements) {
            console.log(`Executing: ${stmt.substring(0, 50)}...`);
            const { error: stmtError } = await supabaseAdmin.rpc('exec_sql', { sql: stmt });
            if (stmtError) {
                console.error(`❌ Statement Failed: ${stmtError.message}`);
                hasErrors = true;
            }
        }
        
        if (!hasErrors) console.log("✅ All statements executed successfully.");
    } else {
        console.log("✅ SQL executed successfully in one batch.");
    }
}

run();
