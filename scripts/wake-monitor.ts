import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// This script is designed to be run by Railway's Cron Scheduler (e.g., once daily)
// It pings UptimeRobot (or any other URL) to ensure the monitoring loop stays active.

const WAKE_URL = process.env.WAKE_URL || process.env.UPTIME_ROBOT_HEARTBEAT_URL;

async function wakeMonitor() {
    if (!WAKE_URL) {
        console.warn('⚠️ No WAKE_URL or UPTIME_ROBOT_HEARTBEAT_URL configured.');
        console.log('usage: set WAKE_URL env var to the UptimeRobot Heartbeat URL');
        process.exit(0); // Don't fail, just exit
    }

    console.log(`⏰ Waking Monitor at: ${WAKE_URL}`);
    try {
        const res = await fetch(WAKE_URL);
        if (res.ok) {
            console.log(`✅ SUCCESS: Pinged Monitor (Status: ${res.status})`);
        } else {
            console.error(`❌ FAILED: Monitor responded with ${res.status}`);
            process.exit(1);
        }
    } catch (error: any) {
        console.error(`💥 ERROR: Could not reach monitor: ${error.message}`);
        process.exit(1);
    }
}

wakeMonitor();
