"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: '.env.local' });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
async function checkCrash() {
    console.log('🔍 Checking for Beta Squad (Claude) Logs...');
    // 1. Check recent logs for errors
    const { data: logs, error } = await supabase
        .from('trinity_agent_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
    if (error)
        console.error('Log Error:', error.message);
    else {
        console.log('\n--- Recent Logs ---');
        logs.forEach(l => { var _a; return console.log(`[${l.created_at}] ${l.agent_name}: ${l.action} - ${(_a = l.message) === null || _a === void 0 ? void 0 : _a.substring(0, 50)}`); });
    }
    // 2. Check Heartbeats
    const { data: heartbeats } = await supabase
        .from('trinity_heartbeat')
        .select('*');
    console.log('\n--- Heartbeats ---');
    heartbeats === null || heartbeats === void 0 ? void 0 : heartbeats.forEach((h) => {
        const minAgo = (Date.now() - new Date(h.last_seen).getTime()) / 60000;
        console.log(`${h.agent}: Seen ${minAgo.toFixed(1)} mins ago (${h.status})`);
    });
}
checkCrash();
