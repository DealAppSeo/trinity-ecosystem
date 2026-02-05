
import { createClient } from '@supabase/supabase-js';

export interface NotificationPayload {
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error' | 'stuck';
    agentName?: string;
    taskId?: string | number;
    metadata?: any;
}

export class NotificationManager {
    private supabase;

    constructor() {
        this.supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
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

        // 2. Critical SMS Alert
        if (payload.type === 'stuck' || payload.type === 'error') {
            const userPhone = process.env.USER_PHONE_NUMBER;
            if (userPhone) {
                await this.sendSMS(userPhone, `⚠️ [TRINITY STUCK] ${payload.agentName}: ${payload.message}`);
            }
        }

        // 3. Task Completion Success
        if (payload.type === 'success' && payload.metadata?.important) {
            const userPhone = process.env.USER_PHONE_NUMBER;
            if (userPhone) {
                await this.sendSMS(userPhone, `✅ [TRINITY DONE] ${payload.title}`);
            }
        }
    }
}

export const notificationManager = new NotificationManager();
