import { NextRequest, NextResponse } from 'next/server';
import { bot, sendIntelligenceAlert } from '@/lib/telegram/bot';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * External Alert Gateway.
 * Allows Python-based engines (VERITAS, HDM) to trigger Telegram notifications.
 */
export async function POST(req: NextRequest) {
    const authHeader = req.headers.get('Authorization');
    if (authHeader !== `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { type, data } = await req.json();
        const OWNER_ID = process.env.TELEGRAM_OWNER_CHAT_ID;

        if (!OWNER_ID) {
            return NextResponse.json({ error: 'OWNER_ID not configured' }, { status: 500 });
        }

        // Check HITL Settings for suppression
        const { data: settings } = await supabaseAdmin
            .from('hitl_settings')
            .select('suppression_mode, priority_threshold')
            .eq('agent_id', 'trinity-orch')
            .maybeSingle();

        const isCriticalOnly = settings?.suppression_mode === 'critical';
        const isMuted = settings?.suppression_mode === 'muted';

        if (isMuted) return NextResponse.json({ ok: true, status: 'Muted' });

        if (type === 'drift') {
            const { severity, score, message, summary } = data;

            // Suppress non-critical drift if in "Critical Only" mode
            if (isCriticalOnly && severity !== 'HIGH') {
                return NextResponse.json({ ok: true, status: 'Suppressed' });
            }

            const alertTitle = severity === 'HIGH' ? '🚨 CRITICAL DRIFT' : '📡 ARCHITECTURAL DRIFT';
            const alertMsg = `
${alertTitle}: *${severity}* (Score: ${score})
━━━━━━━━━━━━━━━━━━━━
📝 ${message}

📊 *Summary*:
• Tables: +${summary.added_tables_count}, -${summary.removed_tables_count}
• Columns: +${summary.added_columns_count}, -${summary.removed_columns_count}
• Types: ${summary.modified_types_count} changed

_Alert triggered by VERITAS Drift Engine_
`;
            await bot.telegram.sendMessage(OWNER_ID, alertMsg, { parse_mode: 'Markdown' });

        } else if (type === 'governance') {
            const { proposal_id, proposer, description, severity } = data;

            if (isCriticalOnly && severity !== 'HIGH') {
                return NextResponse.json({ ok: true, status: 'Suppressed' });
            }

            const alertMsg = `
⚖️ *GOVERNANCE PROPOSAL*
━━━━━━━━━━━━━━━━━━━━
👤 *Proposer*: ${proposer}
📝 *Description*: ${description}
🆔 *Proposal ID*: \`${proposal_id}\`

_Action required via /tasks or Dashboard_
`;
            await bot.telegram.sendMessage(OWNER_ID, alertMsg, { parse_mode: 'Markdown' });

        } else {
            // Generic alert fallback
            await sendIntelligenceAlert(data);
        }

        return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error('[Alert Gateway Error]:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
