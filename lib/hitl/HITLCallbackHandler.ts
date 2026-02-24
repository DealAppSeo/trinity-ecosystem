import { supabaseAdmin as supabase } from '../supabase';
import { VeritasSignatureService } from './VeritasSignatureService';

export class HITLCallbackHandler {
    /**
     * Handles the Telegram webhook callback.
     */
    static async handleTelegramCallback(body: any) {
        const callbackQuery = body.callback_query;
        if (!callbackQuery) return;

        const data = callbackQuery.data; // e.g. "hitl_approve_123"
        const chatId = callbackQuery.message.chat.id;
        const messageId = callbackQuery.message.message_id;

        const parts = data.split('_');
        const action = parts[1]; // approve / escalate
        const taskId = parts[2];

        try {
            // 1. Fetch the pending decision from Supabase
            const { data: decision, error: fetchError } = await supabase
                .from('trinity_hitl_decisions')
                .select('*')
                .eq('task_id', taskId)
                .eq('decision', 'PENDING')
                .single();

            if (fetchError || !decision) throw new Error('Pending decision not found or already processed.');

            // 2. VERITAS Verification (Phase 1 Stub)
            const isValid = await VeritasSignatureService.verify(decision);
            if (!isValid) throw new Error('Signature verification failed.');

            const finalDecision = action === 'approve' ? 'APPROVED' : 'ESCALATED';

            // 3. Update Decision Table
            await supabase
                .from('trinity_hitl_decisions')
                .update({
                    decision: finalDecision,
                    decided_at: new Date().toISOString()
                })
                .eq('id', decision.id);

            // 4. Update Task Status to resume agent
            const taskUpdate = action === 'approve'
                ? { status: 'doing', result: `[HITL] Approved by human operator. Resuming mission.` }
                : { status: 'todo', result: `[HITL] Escalated to management. Task reset to queue.` };

            await supabase
                .from('trinity_tasks')
                .update(taskUpdate)
                .eq('id', taskId);

            // 5. Respond to Telegram (Clean up the buttons)
            const responseText = `✅ *Decision recorded: ${finalDecision}*
Task #${taskId}
Agent: ${decision.agent_id}
Operator: Sean (Remote)

Agent has been notified.`;

            await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/editMessageText`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    message_id: messageId,
                    text: responseText,
                    parse_mode: 'Markdown'
                })
            });

        } catch (e: any) {
            console.error('❌ HITL Callback Failed:', e.message);
            // Notify user of failure
            await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: `❌ Error processing decision: ${e.message}`
                })
            });
        }
    }
}
