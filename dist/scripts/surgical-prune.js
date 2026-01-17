"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), '.env.local') });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = (0, supabase_js_1.createClient)(url, key);
async function surgicalPrune() {
    console.log('--- [TRINITY ⚡ SURGICAL PRUNE] ---');
    console.log('Objective: Delete 5000 tasks at a time to clear the gridlock.');
    let totalDeleted = 0;
    const batchSize = 1000;
    const target = 10000;
    for (let i = 0; i < 10; i++) {
        console.log(`Pruning batch ${i + 1}...`);
        // Use a raw RPC if available, or fetch IDs and delete
        const { data: ids, error: fetchError } = await supabase
            .from('trinity_tasks')
            .select('id')
            .order('id', { ascending: true })
            .limit(batchSize);
        if (fetchError || !ids || ids.length === 0) {
            console.log('No more tasks found or error:', fetchError === null || fetchError === void 0 ? void 0 : fetchError.message);
            break;
        }
        const { error: delError } = await supabase
            .from('trinity_tasks')
            .delete()
            .in('id', ids.map(t => t.id));
        if (delError) {
            console.error('❌ Delete failed:', delError.message);
            break;
        }
        totalDeleted += ids.length;
        console.log(`✅ Deleted ${totalDeleted} tasks.`);
        // Breathe to allow DB to process
        await new Promise(r => setTimeout(r, 1000));
    }
    console.log('--- [PRUNE FINISHED] ---');
}
surgicalPrune();
