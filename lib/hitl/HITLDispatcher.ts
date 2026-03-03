import { supabaseAdmin as supabase } from '../supabase';
import { VeritasSignatureService, HITLPayload } from './VeritasSignatureService';

export interface CryptoHITLPayload extends HITLPayload {
    asset?: string;
    regime?: string;
    whaleScore?: number;
    consensusId?: string; // UUID from prediction_consensus
}

export class HITLDispatcher {
    private static get BOT_TOKEN() { return process.env.TELEGRAM_BOT_TOKEN; }
    private static get CHAT_ID() { return process.env.TELEGRAM_OWNER_CHAT_ID; }

    /**
     * Dispatches a 🔔 CRYPTO HITL alert to Telegram.
     */
    static async dispatchCryptoHITL(payload: CryptoHITLPayload) {
        if (!this.BOT_TOKEN || !this.CHAT_ID) return { status: 'FAILED', reason: 'Configuration Missing' };

        const signed = VeritasSignatureService.sign(payload);

        const message = `\ud83d\udd14 *CRYPTO HITL*
    
*Asset:* ${payload.asset || 'N/A'}
*Regime:* ${payload.regime || 'N/A'}
*Task:* #${payload.taskId}
*Confidence:* ${payload.confidenceScore.toFixed(2)}
*WhaleScore:* ${payload.whaleScore ? payload.whaleScore.toFixed(2) : 'N/A'}

*Mission:* "${payload.missionSummary}"

*Reason:* ${payload.escalationReason}

*Authority:* HIAS Hunch Taxonomy (Filing 3)
*Signature:* \u2705 VERITAS-VERIFIED`;

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
                                { text: '✅ APPROVE', callback_data: `crypto_approve_${payload.taskId}_${payload.consensusId}` },
                                { text: '⬇️ DEFER', callback_data: `crypto_defer_${payload.taskId}_${payload.consensusId}` }
                            ],
                            [
                                { text: '❌ REJECT', callback_data: `crypto_reject_${payload.taskId}_${payload.consensusId}` }
                            ]
                        ]
                    }
                })
            });

            const tgResult = await response.json();
            if (!tgResult.ok) throw new Error(tgResult.description);

            // Record in existing HITL decisions table for backward compatibility/audit
            await supabase.from('trinity_hitl_decisions').insert({
                task_id: parseInt(payload.taskId),
                agent_id: payload.agentId,
                agent_repid: payload.agentRepId,
                mission_summary: payload.missionSummary,
                confidence_score: payload.confidenceScore,
                s_pi_score: payload.spiScore,
                escalation_reason: payload.escalationReason,
                signature: signed.signature,
                telegram_message_id: tgResult.result.message_id,
                decision: 'PENDING'
            });

            return { status: 'SENT', telegramMessageId: tgResult.result.message_id };

        } catch (e: any) {
            console.error('❌ Crypto HITL Dispatch Failed:', e.message);
            return { status: 'FAILED', reason: e.message };
        }
    }

    /**
     * Dispatches a 🚨 WOLF INTERVAL notification.
     */
    static async dispatchWolfInterval(data: { lle: number, gap: number, regime: string }) {
        if (!this.BOT_TOKEN || !this.CHAT_ID) return;
        const message = `🚨 *WOLF INTERVAL*
    
*Chaos Detected (LLE):* ${data.lle.toFixed(4)}
*Pythagorean Gap:* ${data.gap.toFixed(2)}%
*Regime:* ${data.regime}

*Action:* AUTOMATIC VETO — no trade until regime reclassification.`;

        await fetch(`https://api.telegram.org/bot${this.BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: this.CHAT_ID, text: message, parse_mode: 'Markdown' })
        });
    }

    /**
     * Dispatches a 📉 REVERSE CASCADE alert.
     */
    static async dispatchReverseCascade(data: { asset: string, sensitivity: number, triggers: string[] }) {
        if (!this.BOT_TOKEN || !this.CHAT_ID) return;
        const message = `📉 *REVERSE CASCADE*
    
*Asset:* ${data.asset}
*Sensitivity Index:* ${data.sensitivity.toFixed(2)}
*Active Triggers:* ${data.triggers.join(', ')}

*Status:* Monitoring sensitivity cascade. CHESED enforcing safety floors.`;

        await fetch(`https://api.telegram.org/bot${this.BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: this.CHAT_ID, text: message, parse_mode: 'Markdown' })
        });
    }

    /**
     * Dispatches an 📊 Hourly Digest.
     */
    static async dispatchHourlyDigest(data: { stats: string, topAgent: string, accuracy: number }) {
        if (!this.BOT_TOKEN || !this.CHAT_ID) return;
        const message = `📊 *HOURLY PERFORMANCE DIGEST*
    
*Status:* ${data.stats}
*Top Agent:* ${data.topAgent}
*Ensemble Accuracy:* ${(data.accuracy * 100).toFixed(1)}%

*Cycle:* ${new Date().toISOString().split('T')[1].split('.')[0]} UTC`;

        await fetch(`https://api.telegram.org/bot${this.BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: this.CHAT_ID, text: message, parse_mode: 'Markdown' })
        });
    }

    /**
     * Legacy dispatch for backward compatibility.
     */
    static async dispatchToHITL(payload: HITLPayload) {
        return this.dispatchCryptoHITL({
            ...payload,
            asset: 'N/A',
            regime: 'N/A',
            whaleScore: 0
        });
    }
}
