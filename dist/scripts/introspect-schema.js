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
async function checkSchema() {
    console.log('--- [TRINITY SCHEMA INTROSPECTION] ---');
    console.log(`Checking table: trinity_artifacts`);
    const { data: cols, error } = await supabase
        .from('trinity_artifacts')
        .select('*')
        .limit(1);
    if (error) {
        console.error('❌ Selective fetch failed:', error.message);
        // Try a more direct approach if possible
    }
    else if (cols && cols.length > 0) {
        console.log('✅ Columns found:', Object.keys(cols[0]));
    }
    else {
        console.log('⚠️ Table exists but is empty. Trying to guess columns via insertion...');
        const testPayloads = [
            { id: '99999999-9999-9999-9999-999999999999', title: 'test', content: 'test' },
            { id: '99999999-9999-9999-9999-999999999999', title: 'test', content_preview: 'test' },
            { id: '99999999-9999-9999-9999-999999999999', name: 'test', content: 'test' }
        ];
        for (const p of testPayloads) {
            const { error: err } = await supabase.from('trinity_artifacts').insert(p);
            if (err) {
                console.log(`❌ Insertion with ${JSON.stringify(Object.keys(p))} failed: ${err.message}`);
            }
            else {
                console.log(`✅ Insertion with ${JSON.stringify(Object.keys(p))} SUCCEEDED.`);
                // Clean up
                await supabase.from('trinity_artifacts').delete().eq('id', p.id);
            }
        }
    }
}
checkSchema();
