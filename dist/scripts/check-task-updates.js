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
async function check() {
    const fiveMinsAgo = new Date(Date.now() - 5 * 60000).toISOString();
    const { data, error } = await supabase
        .from('trinity_tasks')
        .select('*')
        .gte('updated_at', fiveMinsAgo);
    if (error) {
        console.error('Error:', error.message);
    }
    else {
        console.log(`Tasks updated in last 5 mins: ${(data === null || data === void 0 ? void 0 : data.length) || 0}`);
        data === null || data === void 0 ? void 0 : data.forEach(t => {
            console.log(`[${t.status}] ${t.title} - Claimed by: ${t.claimed_by}`);
        });
    }
}
check();
