"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: '.env.local' });
const supabase_js_1 = require("@supabase/supabase-js");
const supabase = (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function checkHeartbeats() {
    console.log('💓 Checking Trinity Heartbeats...');
    // Get all heartbeats
    const { data: heartbeats, error } = await supabase
        .from('trinity_heartbeat')
        .select('*')
        .order('last_seen', { ascending: false });
    if (error) {
        console.error('❌ Failed:', error.message);
        return;
    }
    const now = new Date();
    console.log('🕒 Current Time (UTC):', now.toISOString());
    heartbeats.forEach(hb => {
        const lastSeen = new Date(hb.last_seen);
        const diffMs = now.getTime() - lastSeen.getTime();
        const diffMins = (diffMs / 60000).toFixed(1);
        let status = '🟢 ALIVE';
        if (diffMs > 120000)
            status = '🔴 DEAD'; // 2 mins
        console.log(`[${status}] ${hb.agent.padEnd(20)} | Last Seen: ${hb.last_seen} (${diffMins} mins ago)`);
    });
}
checkHeartbeats();
