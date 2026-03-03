
import { supabase } from '../supabase';

export interface NotificationPayload {
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error' | 'stuck';
    agentName?: string;
    taskId?: string | number;
    metadata?: any;
}

export class NotificationManager {
    private supabase = supabase;

    constructor() {
        // Use centralized client from ../supabase
    }

    /**
     * Send an SMS via a generic Webhook/Twilio bridge.
     * In V3, this routes to a specialized 'Trinity-Notifier' microservice if configured.
     */
    async sendSMS(to: string, message: string) {
        console.log(`[Notification] 📱 Sending SMS to ${to}: ${message}`);

        const WEBHOOK_URL = process.env.NOTIFICATION_WEBHOOK_URL;
        if (!WEBHOOK_URL) {
            console.warn('[Notification] ⚠️ NOTIFICATION_WEBHOOK_URL not configured. SMS suppressed.');
            return false;
        }

        try {
            const response = await fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to,
                    message,
                    source: 'trinity-swarm',
                    timestamp: new Date().toISOString()
                })
            });
            return response.ok;
        } catch (e) {
            console.error('[Notification] ❌ SMS Webhook failed:', e);
            return false;
        }
    }

    /**
     * Send a notification via Telegram bot.
     */
    async sendTelegram(message: string) {
        const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const CHAT_ID = process.env.TELEGRAM_OWNER_CHAT_ID;

        if (!BOT_TOKEN || !CHAT_ID) {
            console.warn('[Notification] ⚠️ Telegram credentials missing. Notification suppressed.');
            return false;
        }

        try {
            const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: CHAT_ID,
                    text: message,
                    parse_mode: 'Markdown'
                })
            });
            return response.ok;
        } catch (e) {
            console.error('[Notification] ❌ Telegram notification failed:', e);
            return false;
        }
    }

    /**
     * Notify the user via the system-wide Event Log and SMS if critical.
     */
    async notifyUser(payload: NotificationPayload) {
        console.log(`[Notification] 🔔 ${payload.title}: ${payload.message}`);

        // 1. Log to trinity_system_events for UI visibility
        try {
            await this.supabase.from('trinity_agent_logs').insert([{
                agent_name: payload.agentName || 'SYSTEM',
                action: `notification_${payload.type}`,
                message: `${payload.title}: ${payload.message}`,
                metadata: {
                    ...payload.metadata,
                    notification_type: payload.type,
                    taskId: payload.taskId
                }
            }]);
        } catch (e) {
            console.error('[Notification] 🚨 Failed to log notification to DB:', e);
        }

        // 2. Critical Alert (SMS & Telegram)
        if (payload.type === 'stuck' || payload.type === 'error') {
            const userPhone = process.env.USER_PHONE_NUMBER;
            if (userPhone) {
                await this.sendSMS(userPhone, `⚠️ [TRINITY STUCK] ${payload.agentName}: ${payload.message}`);
            }
            await this.sendTelegram(`🚨 *[TRINITY ${payload.type.toUpperCase()}]*\nAgent: \`${payload.agentName || 'SYSTEM'}\`\nMessage: ${payload.message}`);
        }

        // 3. Task Completion Success
        if (payload.type === 'success' && payload.metadata?.important) {
            const userPhone = process.env.USER_PHONE_NUMBER;
            if (userPhone) {
                await this.sendSMS(userPhone, `✅ [TRINITY DONE] ${payload.title}`);
            }
            await this.sendTelegram(`✅ *[TRINITY SUCCESS]*\n${payload.title}\n\n${payload.message}`);
        }
    }
}

export const notificationManager = new NotificationManager();
