import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import fetch from 'node-fetch';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!;
const heartbeatUrl = process.env.UPTIMEROBOT_HEARTBEAT_URL;

const supabase = createClient(supabaseUrl, supabaseKey);

async function log(message: string, type: 'info' | 'error' | 'heartbeat' = 'info') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [MISSION-CONTROLLER] ${message}`);
    
    try {
        await supabase.from('trinity_agent_logs').insert({
            agent: 'MISSION_CONTROLLER',
            agent_name: 'MISSION_CONTROLLER',
            action: type === 'heartbeat' ? 'HEARTBEAT_PULSE' : 'SYSTEM_LOG',
            message,
            metadata: { timestamp, type },
            created_at: timestamp
        });
    } catch (e) {
        console.error('Failed to log to Supabase:', e);
    }
}

async function sendHeartbeat() {
    if (!heartbeatUrl) {
        await log('UPTIMEROBOT_HEARTBEAT_URL not configured. Skipping external pulse.', 'info');
        return;
    }

    try {
        const res = await fetch(heartbeatUrl);
        if (res.ok) {
            await log('Heartbeat pulse sent successfully to UptimeRobot.', 'heartbeat');
        } else {
            await log(`Heartbeat pulse failed: ${res.statusText}`, 'error');
        }
    } catch (e: any) {
        await log(`Heartbeat pulse exception: ${e.message}`, 'error');
    }
}

async function checkSystemHealth() {
    // Monitor for stuck tasks or offline agents
    try {
        const { count, error } = await supabase
            .from('trinity_tasks')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'in_progress');

        if (error) throw error;
        
        await log(`System Health Check: ${count} tasks currently in progress.`, 'info');
    } catch (e: any) {
        await log(`Health check failed: ${e.message}`, 'error');
    }
}

async function run() {
    await log('Mission Controller started. Initializing heartbeat loop...', 'info');
    
    // Initial pulse
    await sendHeartbeat();
    await checkSystemHealth();

    // Run every 5 minutes
    setInterval(async () => {
        await sendHeartbeat();
        await checkSystemHealth();
    }, 5 * 60 * 1000);
}

run();
