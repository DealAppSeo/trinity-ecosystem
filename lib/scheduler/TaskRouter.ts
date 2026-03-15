import { supabaseAdmin as supabase } from '../lib/supabase';
import fetch from 'node-fetch';

export class TaskRouter {
    private telegramToken: string = process.env.TELEGRAM_BOT_TOKEN || '';
    private chatId: string = process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_OWNER_CHAT_ID || '';

    constructor() { }

    /**
     * Polls for pending tasks and dispatches them to assigned agents.
     */
    async pollAndRoute() {
        console.log(`[SCHEDULER] 🔍 Polling for pending tasks...`);

        const { data: tasks, error } = await supabase
            .from('trinity_tasks')
            .select('*')
            .eq('status', 'pending')
            .order('priority', { ascending: false });

        if (error) {
            console.error(`[SCHEDULER] Error fetching tasks:`, error.message);
            return;
        }

        if (!tasks || tasks.length === 0) {
            console.log(`[SCHEDULER] No pending tasks found.`);
            return;
        }

        console.log(`[SCHEDULER] Found ${tasks.length} pending tasks. Dispatching...`);

        for (const task of tasks) {
            await this.dispatchTask(task);
        }
    }

    private async dispatchTask(task: any) {
        const agentName = task.assigned_to || task.claimed_by || 'ORCH';
        const agentUrl = await this.getAgentUrl(agentName);

        if (!agentUrl) {
            console.warn(`[SCHEDULER] ⚠️ No URL found for agent ${agentName}. Skipping task ${task.id}.`);
            return;
        }

        console.log(`[SCHEDULER] 🚀 Dispatching task ${task.id} to ${agentName} at ${agentUrl}`);

        try {
            // Update status to in_progress first to prevent multiple dispatches
            await supabase.from('trinity_tasks').update({ status: 'in_progress', claimed_by: agentName }).eq('id', task.id);

            const response = await fetch(`${agentUrl}/api/task`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(task)
            });

            if (response.ok) {
                const result = await response.json();
                console.log(`[SCHEDULER] ✅ Task ${task.id} successfully completed by ${agentName}.`);
                await supabase.from('trinity_tasks').update({
                    status: 'completed',
                    result: JSON.stringify(result),
                    completed_at: new Date().toISOString()
                }).eq('id', task.id);
                await this.notifyTelegram(`✅ *Task Completed*\nAgent: ${agentName}\nTask: ${task.title}`);
            } else {
                const errText = await response.text();
                console.error(`[SCHEDULER] ❌ Agent execution failed for task ${task.id}: ${response.status} - ${errText}`);
                await supabase.from('trinity_tasks').update({ status: 'failed', result: errText }).eq('id', task.id);
                await this.notifyTelegram(`❌ *Task Failed*\nAgent: ${agentName}\nTask: ${task.title}\nError: ${response.status}`);
            }
        } catch (e: any) {
            console.error(`[SCHEDULER] ❌ Network error dispatching task ${task.id}:`, e.message);
            await supabase.from('trinity_tasks').update({ status: 'pending' }).eq('id', task.id); // Revert
        }
    }

    private async getAgentUrl(agentName: string): Promise<string | null> {
        // First check trinity_agent_registry for a recorded service_url
        const { data } = await supabase
            .from('trinity_agent_registry')
            .select('service_url')
            .eq('agent_name', agentName)
            .single();

        if (data?.service_url) return data.service_url;

        // Fallback to naming convention if on Railway: https://trinity-[agentname].up.railway.app
        const slug = agentName.toLowerCase().replace('trinity-', '');
        return `https://trinity-${slug}-production.up.railway.app`;
    }

    private async notifyTelegram(message: string) {
        if (!this.telegramToken || !this.chatId) return;

        try {
            await fetch(`https://api.telegram.org/bot${this.telegramToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: this.chatId,
                    text: message,
                    parse_mode: 'Markdown'
                })
            });
        } catch (e: any) {
            console.error(`[SCHEDULER] Telegram notify error:`, e.message);
        }
    }
}
