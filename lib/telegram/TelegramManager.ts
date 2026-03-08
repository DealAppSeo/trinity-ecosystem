import { Context, Telegraf, Markup } from 'telegraf';
import { supabase } from '../supabase';

export class TelegramManager {
    private bot: Telegraf;
    private chatId: string;

    constructor() {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        this.chatId = process.env.TELEGRAM_OWNER_CHAT_ID || '';

        if (!token) {
            throw new Error('TELEGRAM_BOT_TOKEN is missing');
        }
        this.bot = new Telegraf(token);
    }

    /**
     * Send a formatted alert to the main channel.
     */
    async sendAlert(message: string, options: { parse_mode?: 'Markdown' | 'HTML', reply_markup?: any } = {}) {
        if (!this.chatId) return;
        try {
            await this.bot.telegram.sendMessage(this.chatId, message, {
                parse_mode: 'Markdown',
                ...options
            });
        } catch (error) {
            console.error('[Telegram] ❌ Failed to send alert:', error);
        }
    }

    /**
     * On-chain registration confirmation alert
     */
    async notifyRegistration(agentName: string, tokenId: string) {
        const msg = `✅ *${agentName}* registered on ERC-8004\nToken ID: \`${tokenId}\`\n[View on Explorer](https://sepolia.basescan.org/token/${process.env.NEXT_PUBLIC_ERC8004_IDENTITY_REGISTRY}?a=${tokenId})`;
        await this.sendAlert(msg);
    }

    /**
     * BFT Vote Update
     */
    async notifyBFT(proposal: string, votes: number, total: number, timeRemaining: number) {
        const msg = `🗳️ *Vote in progress*\nProposal: ${proposal}\nStatus: \`${votes}/${total}\` agents voted\n⏳ \`${timeRemaining}s\` remaining`;
        await this.sendAlert(msg);
    }

    /**
     * Trade Execution
     */
    async notifyTrade(agentName: string, action: string, asset: string, amount: number, orderId: string, txHash?: string) {
        const msg = `⚡ *${agentName}* executed ${action} ${amount} ${asset}\nCoinbase ID: \`${orderId}\`\n${txHash ? `[Receipt](https://sepolia.basescan.org/tx/${txHash})` : ''}`;
        await this.sendAlert(msg);
    }

    /**
     * Reputation Update
     */
    async notifyReputation(agentName: string, oldScore: number, newScore: number) {
        const msg = `📈 *${agentName}* reputation updated: \`${oldScore}\` → \`${newScore}\` on ERC-8004`;
        await this.sendAlert(msg);
    }

    /**
     * Health Check (Hourly)
     */
    async notifyHealth(statuses: { name: string, online: boolean }[]) {
        const statusList = statuses.map(s => `${s.online ? '🟢' : '🔴'} ${s.name}`).join('\n');
        const msg = `📊 *Trinity Symphony Status*\n━━━━━━━━━━━━━━━━━━━━\n${statusList}\n\nSystem check complete.`;
        await this.sendAlert(msg);
    }

    /**
     * Voice Command
     */
    async notifyVoice(transcript: string, action: string) {
        const msg = `🎙️ *Voice command received*\n"${transcript}"\nAction: \`${action}\` initiated.`;
        await this.sendAlert(msg);
    }

    /**
     * Override Window Alert
     */
    async notifyOverride(agentName: string, action: string) {
        const msg = `⚠️ *10-second override window open*\nTrade: ${agentName} → ${action}\nReply *STOP* to abort immediately.`;
        await this.sendAlert(msg);
    }

    /**
     * Daily Summary
     */
    async notifyDailySummary(trades: number, repAvg: number, savings: number) {
        const msg = `📊 *Trinity Symphony Daily Summary*\n━━━━━━━━━━━━━━━━━━━━\nTrades: \`${trades}\` \nReputation Avg: \`${repAvg}\` \nCost savings via ANFIS: \`$${savings.toFixed(2)}\``;
        await this.sendAlert(msg);
    }
}

export const telegramManager = new TelegramManager();
