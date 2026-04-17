const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: 'c:/Users/Cash4/OneDrive/Desktop/trinity-ecosystem/trinity-ecosystem/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_OWNER_CHAT_ID;

const supabase = createClient(supabaseUrl, supabaseKey);

async function logSprint(milestone) {
    console.log(`[SPRINT] ${milestone}`);
    try {
        await supabase.from('sprint_updates').insert({
            milestone_description: milestone,
            timestamp: new Date().toISOString()
        });
    } catch (e) {
        console.error("Failed to log to sprint_updates:", e.message);
    }
}

const https = require('https');

async function sendTelegram(text) {
    if (!token || !chatId) return;
    const data = JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' });
    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${token}/sendMessage`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let resData = '';
            res.on('data', (chunk) => { resData += chunk; });
            res.on('end', () => { resolve(JSON.parse(resData)); });
        });
        req.on('error', (e) => { reject(e); });
        req.write(data);
        req.end();
    });
}

async function runAudit() {
    console.log("--- Running 2-Hour Audit ---");

    // 1. ANFIS health
    const { data: decisions } = await supabase
        .from('anfis_decisions')
        .select('cost_alternative, cost_selected')
        .order('created_at', { ascending: false })
        .limit(100);

    let avgDelta = 0;
    if (decisions && decisions.length > 0) {
        avgDelta = decisions.reduce((acc, d) => acc + ((d.cost_alternative || 0) - (d.cost_selected || 0)), 0) / decisions.length;
    }

    // 2. TODO Queue
    const { count: todoCount } = await supabase
        .from('trinity_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'todo');

    const auditSummary = `
🌓 *Overnight Audit Report*
⏱️ Time: ${new Date().toLocaleTimeString()}
🧠 ANFIS Avg Delta: ${avgDelta.toFixed(4)}
📋 TODO Queue: ${todoCount} tasks pending.
🛠️ Swarm Status: Monitoring offline agents and stuck tasks...
`.trim();

    await sendTelegram(auditSummary);
    await logSprint("2-hour audit cycle complete.");
}

async function monitorSwarm() {
    console.log("--- Monitoring Swarm Integrity ---");

    // 1. Offline Agents (> 15m)
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: agents } = await supabase
        .from('trinity_agent_registry')
        .select('agent_name, last_active')
        .lt('last_active', fifteenMinsAgo);

    if (agents && agents.length > 0) {
        for (const agent of agents) {
            const alert = `🚨 *HITL ALERT*: ${agent.agent_name} has been OFFLINE for > 15 minutes! (Last seen: ${new Date(agent.last_active).toLocaleTimeString()})`;
            await sendTelegram(alert);
            await logSprint(`Offline alert sent for ${agent.agent_name}`);
        }
    }

    // 2. Stuck Tasks (doing > 60m)
    const sixtyMinsAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: stuckTasks } = await supabase
        .from('trinity_tasks')
        .select('id, title, assigned_to')
        .eq('status', 'doing')
        .lt('started_at', sixtyMinsAgo);

    if (stuckTasks && stuckTasks.length > 0) {
        for (const task of stuckTasks) {
            console.log(`⚠️ Stuck task detected: ${task.id} (${task.title})`);

            // Mark as failed
            await supabase.from('trinity_tasks').update({
                status: 'failed',
                result: 'MARKED FAILED: Task remained in "doing" status for > 60 minutes.'
            }).eq('id', task.id);

            // Re-seed
            await supabase.from('trinity_tasks').insert({
                title: task.title,
                description: `RE-SEEDED: Original task ${task.id} timed out.`,
                assigned_to: task.assigned_to,
                status: 'todo',
                priority: 80, // Default priority for re-seeds
                task_type: 'recovery',
                is_real: true
            });

            const recoveryMsg = `🔄 *Task Recovery*: Task ${task.id} (${task.title}) was stuck in 'doing' for > 60m. Mark as failed and re-seeded for ${task.assigned_to}.`;
            await sendTelegram(recoveryMsg);
            await logSprint(`Recovered stuck task ${task.id}`);
        }
    }
}

async function main() {
    console.log("🚀 Initializing Overnight Sprint Monitoring...");
    await logSprint("Overnight sprint initialized.");

    // Initial Run
    await runAudit();
    await monitorSwarm();

    // Set Intervals
    setInterval(runAudit, 2 * 60 * 60 * 1000); // 2 hours
    setInterval(monitorSwarm, 15 * 60 * 1000); // Check every 15 mins for offline/stuck
}

main();
