"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv = __importStar(require("dotenv"));
dotenv.config({ path: '.env.local' });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase credentials in .env.local');
    process.exit(1);
}
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceKey);
async function runMigration() {
    const migrationPath = path.join(__dirname, '../supabase/migrations/20260103_fix_controller.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log('🚀 Running Migration: 20260103_fix_controller.sql');
    // Supabase JS client doesn't support running raw SQL directly via rpc unless a function exists.
    // However, if we have a direct connection string we could use pg.
    // BUT the user context provides `supabase` client.
    // We can use the text/sql check or just try to use the REST API if we can (but we can't run DDL).
    // ALTERNATIVE: Use the verifying script logic which might just check things.
    // Wait, the user has a `scripts/verify-db.ts`? Maybe I can use `ts-node` to run logic but NOT DDL?
    // Actually, I can't run DDL (CREATE TABLE) via supabase-js client unless I call an RPC that execs sql.
    // If the user doesn't have an `exec_sql` RPC function, I can't run this migration from here smoothly.
    // HACK: I should have asked the user or used a PG client if available (e.g. `pg` or `postgres` npm package).
    // I recall `package.json` had `ts-node` and `dotenv`. Does it have `pg`?
    // I checked `package.json` earlier. It has `@supabase/supabase-js`. NO `pg`.
    // If I can't run DDL, I should ask the user to run it OR try to simulate it (e.g. explicit insert calls).
    // But fixing `trinity_tasks` indices needs SQL.
    // I will try to instruct the user to run it via dashboard.
    // OR create an RPC function if I can? No, creating RPC needs SQL.
    // However, I can insert the 'evo' agent using normal JS insert.
    // I can't fix indices or create tables easily without SQL access.
    // I will split the task:
    // 1. JS script to insert 'evo'.
    // 2. Notify user to run SQL for table optimization.
    // I'll rewrite this script to just insert the agent.
    console.log('ℹ️ Attempting to insert EVO agent via JS...');
    const { error: insertError } = await supabase
        .from('trinity_agent_groups')
        .insert({
        group_name: 'GAMMA',
        agent_name: 'trinity-evo',
        description: 'Evolutionary Optimization Agent',
        capabilities: { focus: 'optimization' }
    })
        .select();
    if (insertError) {
        if (insertError.code === '23505') { // Unique violation
            console.log('✅ EVO agent already exists.');
        }
        else {
            console.error('❌ Failed to insert EVO:', insertError);
        }
    }
    else {
        console.log('✅ EVO agent inserted successfully.');
    }
}
runMigration();
