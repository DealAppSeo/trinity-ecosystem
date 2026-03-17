import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

async function sendTelegramMessage(text: string) {
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_OWNER_CHAT_ID;
    
    if (!BOT_TOKEN || !CHAT_ID) return;

    try {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text,
                parse_mode: 'Markdown'
            })
        });
    } catch (e) {
        console.error('Failed to send Telegram message:', e);
    }
}

export async function POST(req: Request) {
    try {
        const authHeader = req.headers.get('authorization') || req.headers.get('x-trinity-admin-key');
        
        const body = await req.json().catch(() => ({}));
        const agent = body.agent;
        let count = parseInt(body.count) || 3;
        const threshold = 3;

        if (!agent) {
            return NextResponse.json({ error: "Missing 'agent' in request body" }, { status: 400 });
        }

        // 1. Check current pending queue depth for agent
        const { count: pendingCount, error: countError } = await supabase
            .from('trinity_tasks')
            .select('*', { count: 'exact', head: true })
            .eq('agent_name', agent)
            .in('status', ['pending', 'todo']);

        const currentQueueDepth = pendingCount || 0;

        let tasksAdded = 0;

        // 2. Refill if below threshold
        if (currentQueueDepth < threshold) {
            const refillNeeded = count; // Requested count to add
            
            const newTasks = [];
            for (let i = 0; i < refillNeeded; i++) {
                newTasks.push({
                    title: `[AUTOGEN] ${agent} Refill Task ${i + 1}`,
                    description: `Generated fallback mission for ${agent}. Awaiting specific orchestration directives.`,
                    agent_name: agent,
                    status: 'pending',
                    priority: 10,
                    task_type: 'research',
                    created_at: new Date().toISOString()
                });
            }

            const { error: insertError } = await supabase
                .from('trinity_tasks')
                .insert(newTasks);

            if (insertError) throw insertError;
            tasksAdded = refillNeeded;
        }

        const newQueueDepth = currentQueueDepth + tasksAdded;

        // 3. Telegram notification
        const msg = `📋 *${agent}* refilled: ${tasksAdded} tasks added.\nQueue: ${newQueueDepth} pending`;
        await sendTelegramMessage(msg);

        // 4. Return success
        return NextResponse.json({
            agent,
            tasks_added: tasksAdded,
            current_queue_depth: newQueueDepth
        });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
