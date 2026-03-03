import { supabaseAdmin as supabase } from '../supabase';
import { VeritasSignatureService } from './VeritasSignatureService';

export class HITLCallbackHandler {
    /**
     * Handles the Telegram webhook callback.
     */
    static async handleTelegramCallback(body: any) {
        const callbackQuery = body.callback_query;
        if (!callbackQuery) return;

        const data = callbackQuery.data;
        const chatId = callbackQuery.message.chat.id;
        const messageId = callbackQuery.message.message_id;

        try {
            if (data.startsWith('crypto_')) {
                await this.handleInitialAction(data, chatId, messageId);
            } else if (data.startsWith('alpha_')) {
                // Re-route to AlphaTradeHandler (imported in bot.ts, but we need it here if we want isolation)
                // However, HITLCallbackHandler is a clean place for callback dispatch.
                const { AlphaTradeHandler } = await import('../telegram/AlphaTradeHandler');
                await AlphaTradeHandler.handleCallback(body); // Note: we should probably pass ctx if we had it, or handle body
            } else if (data.startsWith('hcat_')) {
                await this.handleCategorySelection(data, chatId, messageId);
            } else if (data.startsWith('hconf_')) {
                await this.handleConfidenceSelection(data, chatId, messageId);
            } else if (data.startsWith('hitl_')) {
                // Legacy handler
                await this.handleLegacyAction(data, chatId, messageId);
            }
        } catch (e: any) {
            console.error('❌ HITL Callback Failed:', e.message);
            await this.sendErrorMessage(chatId, e.message);
        }
    }

    private static async handleInitialAction(data: string, chatId: number, messageId: number) {
        // Format: crypto_<action>_<taskId>_<consensusId>
        const parts = data.split('_');
        const action = parts[1]; // approve / defer / reject
        const taskId = parts[2];
        const consensusId = parts[3];

        if (action === 'reject') {
            await this.finalizeDecision(taskId, consensusId, 'REJECTED', 'NONE', 0, chatId, messageId);
            return;
        }

        // Ask for Hunch Category (Filing 3: HIAS 8-Category Taxonomy)
        const categories = [
            'PATTERN_RECOGNITION', 'ANOMALY_DETECTION',
            'TIMING_HUNCH', 'RELATIONSHIP_HUNCH',
            'RISK_ASSESSMENT', 'OPPORTUNITY_HUNCH',
            'CAUSAL_HUNCH', 'META_COGNITIVE'
        ];

        const keyboard = categories.reduce((acc: any[][], cat, i) => {
            if (i % 2 === 0) acc.push([]);
            const label = cat.replace('_HUNCH', '').replace('_', ' ');
            acc[acc.length - 1].push({ text: label, callback_data: `hcat_${taskId}_${consensusId}_${action}_${cat}` });
            return acc;
        }, []);

        await this.editMessage(chatId, messageId, `🧠 *Hunch Category Required*\nSelect the category that best describes your reasoning for *${action.toUpperCase()}*:`, keyboard);
    }

    private static async handleCategorySelection(data: string, chatId: number, messageId: number) {
        // Format: hcat_<taskId>_<consensusId>_<action>_<category>
        const parts = data.split('_');
        const taskId = parts[1];
        const consensusId = parts[2];
        const action = parts[3];
        const category = parts.slice(4).join('_');

        // Ask for Confidence (1-10)
        const keyboard = [];
        for (let i = 1; i <= 10; i += 5) {
            const row = [];
            for (let j = i; j < i + 5; j++) {
                row.push({ text: j.toString(), callback_data: `hconf_${taskId}_${consensusId}_${action}_${category}_${j}` });
            }
            keyboard.push(row);
        }

        await this.editMessage(chatId, messageId, `🎯 *Confidence Level*\nOn a scale of 1-10, how confident are you in this *${category}* hunch?`, keyboard);
    }

    private static async handleConfidenceSelection(data: string, chatId: number, messageId: number) {
        // Format: hconf_<taskId>_<consensusId>_<action>_<category>_<confidence>
        const parts = data.split('_');
        const taskId = parts[1];
        const consensusId = parts[2];
        const action = parts[3];
        const category = parts[4]; // Needs logic if category has underscores, but our schema ones don't prefix with hconf
        // Correcting part indexing for category with multiple underscores if any
        const confidence = parts[parts.length - 1];
        const categoryExtracted = parts.slice(4, parts.length - 1).join('_');

        const decisionMap: Record<string, string> = { approve: 'APPROVED', defer: 'DEFERRED' };
        const finalDecision = decisionMap[action] || 'APPROVED';

        await this.finalizeDecision(taskId, consensusId, finalDecision, categoryExtracted, parseInt(confidence), chatId, messageId);
    }

    private static async finalizeDecision(
        taskId: string,
        consensusId: string,
        decision: string,
        category: string,
        confidence: number,
        chatId: number,
        messageId: number
    ) {
        // 1. Update hitl_hunch_log if consensusId exists
        if (consensusId && consensusId !== 'undefined') {
            await supabase.from('hitl_hunch_log').insert({
                consensus_id: consensusId,
                hunch_category: category === 'NONE' ? null : category,
                confidence_in_self: confidence === 0 ? null : confidence,
                operator_id: 'Sean (Remote)',
                metadata: {
                    patent_filing: 'Filing3_HIAS_Adaptive_Authority',
                    taxonomy_version: '1.0'
                }
            });

            // 2. Update prediction_consensus (CORE REQUIREMENT)
            await supabase.from('prediction_consensus').update({
                hitl_decision: decision,
                hitl_completed_at: new Date().toISOString()
            }).eq('cycle_id', consensusId);
        }

        // 3. Update legacy trinity_hitl_decisions
        await supabase.from('trinity_hitl_decisions').update({
            decision: decision,
            decided_at: new Date().toISOString()
        }).eq('task_id', taskId).eq('decision', 'PENDING');

        // 4. Update trinity_tasks to resume agent
        const taskUpdate = decision === 'APPROVED'
            ? { status: 'doing', result: `[HITL] Approved with ${category} hunch (Conf: ${confidence}/10). Resuming.` }
            : { status: 'todo', result: `[HITL] ${decision}. Task reset.` };

        await supabase.from('trinity_tasks').update(taskUpdate).eq('id', taskId);

        // 5. Final Confirmation (Filing 3 Branding)
        const responseText = `\u2705 *Decision Finalized: ${decision}*
Task #${taskId}
Category: ${category.replace('_HUNCH', '').replace('_', ' ')}
Confidence: ${confidence}/10

*HIAS Score Calibration Active.*
*Patent Filing 3 Evidence Logged.*
*Agent Resuming.*`;

        await this.editMessage(chatId, messageId, responseText, []);
    }

    private static async handleLegacyAction(data: string, chatId: number, messageId: number) {
        const parts = data.split('_');
        const action = parts[1];
        const taskId = parts[2];
        const finalDecision = action === 'approve' ? 'APPROVED' : 'ESCALATED';
        await this.finalizeDecision(taskId, 'undefined', finalDecision, 'LEGACY', 0, chatId, messageId);
    }

    private static async editMessage(chatId: number, messageId: number, text: string, keyboard: any[][]) {
        await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/editMessageText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                message_id: messageId,
                text: text,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            })
        });
    }

    private static async sendErrorMessage(chatId: number, message: string) {
        await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: `❌ Error: ${message}` })
        });
    }
}
