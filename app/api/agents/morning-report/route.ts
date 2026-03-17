import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

async function sendTelegramMessage(text: string, replyMarkup?: any) {
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
                parse_mode: 'Markdown',
                reply_markup: replyMarkup
            })
        });
    } catch (e) {
        console.error('Failed to send Telegram message:', e);
    }
}

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const authHeader = req.headers.get('authorization') || req.headers.get('x-trinity-admin-key');
        // Validating via UptimeRobot could pass an auth header, or we rely on IP / secret route
        // This accepts a token if passed, but since UptimeRobot calls it we should be flexible or it can use query param.
        
        const now = new Date();
        const midnight = new Date(now);
        midnight.setHours(0, 0, 0, 0);
        const midnightStr = midnight.toISOString();

        // 1. Agents online/offline (last heartbeat < 10 mins)
        const { data: agents } = await supabase.from('trinity_heartbeat').select('agent, last_seen');
        let onlineCount = 0;
        
        if (agents) {
            agents.forEach(a => {
                const lastSeen = new Date(a.last_seen);
                if ((now.getTime() - lastSeen.getTime()) < 10 * 60 * 1000) {
                    onlineCount++;
                }
            });
        }

        // 2. Pending Tasks
        const { count: pendingCount } = await supabase
            .from('trinity_tasks')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');

        // 3. Completed overnight
        const { count: completedCount } = await supabase
            .from('trinity_tasks')
            .select('*', { count: 'exact', head: true })
            .in('status', ['done', 'verified'])
            .gte('completed_at', midnightStr);

        // 4. BFT Vetoes
        const { count: vetoCount } = await supabase
            .from('trinity_agent_logs')
            .select('*', { count: 'exact', head: true })
            .ilike('message', '%veto%')
            .gte('created_at', midnightStr);

        // 5. Spend (Estimating $0.00 except real data if available from a DB config - simplified for now)
        const spend = 0.00;

        const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

        const message = `🌅 *TRINITY MORNING REPORT* — ${dateStr}
────────────────────────────────
Agents: ${onlineCount}/12 online
Tasks pending: ${pendingCount || 0} | Completed overnight: ${completedCount || 0}
BFT vetoes: ${vetoCount || 0}
Spend: $${spend.toFixed(2)}`;

        // Telegram UI keyboard
        const replyMarkup = {
            inline_keyboard: [
                [
                    { text: '🏥 Health', callback_data: 'health_check' },
                    { text: '📋 Tasks', callback_data: 'view_tasks' },
                    { text: '⚡ Wake All', callback_data: 'wake_all' }
                ]
            ]
        };

        await sendTelegramMessage(message, replyMarkup);

        return NextResponse.json({
            agents_online: onlineCount,
            tasks_pending: pendingCount || 0,
            tasks_completed_overnight: completedCount || 0,
            bft_vetoes: vetoCount || 0,
            estimated_spend: spend,
            timestamp: now.toISOString()
        });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
