import { supabaseAdmin as supabase } from '../supabase';
import { VeritasSignatureService, HITLPayload } from './VeritasSignatureService';

export class HITLDispatcher {
    private static get BOT_TOKEN() { return process.env.TELEGRAM_BOT_TOKEN; }
    private static get CHAT_ID() { return process.env.TELEGRAM_OWNER_CHAT_ID; }

    /**
     * Dispatches a HELP_REQUEST to Telegram and logs it in Supabase.
     */
    static async dispatchToHITL(payload: HITLPayload) {
        if (!this.BOT_TOKEN || !this.CHAT_ID) {
            console.warn('⚠️ Telegram HITL Bridge not configured (TOKEN or CHAT_ID missing)');
            return { status: 'FAILED', reason: 'Configuration Missing' };
        }

        // 1. Sign
        const signed = VeritasSignatureService.sign(payload);

        // 2. Format Message
        const message = `🚨 *AGENT ESCALATION*

*Agent:* ${payload.agentId} [RepID: ${payload.agentRepId}]
*Task:* #${payload.taskId}
*Confidence:* ${payload.confidenceScore.toFixed(2)}
*S(π):* ${payload.spiScore.toFixed(3)}

*Mission:* "${payload.missionSummary}"

*Reason:* ${payload.escalationReason}

*Signature:* ✅ VERITAS-VERIFIED`;

        // 3. Send to Telegram
        try {
            const url = `https://api.telegram.org/bot${this.BOT_TOKEN}/sendMessage`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: this.CHAT_ID,
                    text: message,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ APPROVE', callback_data: `hitl_approve_${payload.taskId}` },
                                { text: '⬆️ ESCALATE', callback_data: `hitl_escalate_${payload.taskId}` }
                            ],
                            [
                                {
                                    text: '🌐 LAUNCH CONTROLLER',
                                    web_app: { url: `https://app.aitrinitysymphony.com/pulse/tasks?id=${payload.taskId}` }
                                }
                            ]
                        ]
                    }
                })
            });

            const tgResult = await response.json();
            if (!tgResult.ok) throw new Error(tgResult.description);

            // 4. Record in Supabase
            const { data, error } = await supabase
                .from('trinity_hitl_decisions')
                .insert({
                    task_id: payload.taskId,
                    agent_id: payload.agentId,
                    agent_repid: payload.agentRepId,
                    mission_summary: payload.missionSummary,
                    confidence_score: payload.confidenceScore,
                    s_pi_score: payload.spiScore,
                    escalation_reason: payload.escalationReason,
                    signature: signed.signature,
                    telegram_message_id: tgResult.result.message_id,
                    decision: 'PENDING'
                })
                .select()
                .single();

            if (error) throw error;

            return { status: 'SENT', hitlDecisionId: data.id, telegramMessageId: tgResult.result.message_id };

        } catch (e: any) {
            console.error('❌ HITL Dispatch Failed:', e.message);
            return { status: 'FAILED', reason: e.message };
        }
    }
}
