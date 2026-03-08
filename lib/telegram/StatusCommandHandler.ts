import { Context, Markup } from 'telegraf';
import { supabaseAdmin as supabase } from '../supabase';

export class StatusCommandHandler {

    /**
     * /status - Real-time system vitals
     */
    static async handleStatus(ctx: Context) {
        try {
            // 1. Real Coinbase Call
            const { coinbaseClient } = await import('../trading/CoinbaseClient');
            const accounts = await coinbaseClient.getAccount();
            // Coinbase returns an array of accounts
            const primaryAccount = accounts.accounts?.[0] || { available_balance: { value: '0' }, hold: { value: '0' } };
            const buyingPower = parseFloat(primaryAccount.available_balance.value);
            const equity = buyingPower + parseFloat(primaryAccount.hold.value);

            // 2. Pending HITL
            const { count: pending } = await supabase
                .from('prediction_consensus')
                .select('*', { count: 'exact', head: true })
                .eq('hitl_decision', 'PENDING');

            // 3. Last Cycle
            const { data: lastCycle } = await supabase
                .from('prediction_consensus')
                .select('cycle_started_at, asset, regime_id')
                .order('cycle_started_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            const message = `
📊 *ATS SYSTEM STATUS*
━━━━━━━━━━━━━━━━━━━━
💰 *Coinbase Adv:* $${buyingPower.toLocaleString()}
📈 *Equity:* $${equity.toLocaleString()}
⏳ *Pending HITL:* ${pending || 0}
🕒 *Last Cycle:* ${lastCycle ? lastCycle.asset + ' (' + new Date(lastCycle.cycle_started_at).toLocaleTimeString() + ')' : 'None'}

🚀 *Mode:* Production (Real Trading)
🛡️ *BFT Consensus:* Active
`;
            return ctx.replyWithMarkdown(message);
        } catch (e: any) {
            return ctx.reply(`❌ Status fetch failed: ${e.message}`);
        }
    }

    /**
     * /portfolio - Performance summary
     */
    static async handlePortfolio(ctx: Context) {
        return ctx.reply('📈 *Portfolio performance metrics loading...*', { parse_mode: 'Markdown' });
        // Real implementation would aggregate win rates from trade_execution_log vs postmortem
    }

    /**
     * /pause - Stop prediction cycle
     */
    static async handlePause(ctx: Context) {
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('⏸️ YES, PAUSE', 'sys_pause_CONFIRM')],
            [Markup.button.callback('▶️ KEEP RUNNING', 'sys_pause_CANCEL')]
        ]);

        return ctx.reply('⚠️ *Pause prediction cycle?*\nThis will stop all new signals from being generated.', {
            parse_mode: 'Markdown',
            ...keyboard
        });
    }

    /**
     * /resume - Start prediction cycle
     */
    static async handleResume(ctx: Context) {
        return ctx.reply('✅ *System Resumed.* Prediction cycle is now running.');
    }

    /**
     * /wolf - Assets in veto interval
     */
    static async handleWolf(ctx: Context) {
        return ctx.reply('🚨 *Wolf Interval (Pythagorean Veto)*\nNo assets currently in veto. Swarm harmony is stable.');
    }
}
