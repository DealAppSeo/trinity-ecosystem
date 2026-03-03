import { Context, Markup } from 'telegraf';
import { ATS_ASSETS, TRADABLE_ASSETS } from '../constants';
import { supabaseAdmin as supabase } from '../supabase';
import { RedisAdapter } from '../agent/RedisAdapter';

/**
 * ALPHA Trade States
 */
export enum AlphaState {
    IDLE = 'ALPHA_IDLE',
    ASSET = 'ALPHA_ASSET',
    DIRECTION = 'ALPHA_DIRECTION',
    SIZE = 'ALPHA_SIZE',
    CUSTOM_AMOUNT = 'ALPHA_CUSTOM_AMOUNT',
    HUNCH = 'ALPHA_HUNCH',
    CONFIDENCE = 'ALPHA_CONFIDENCE',
    CONFIRM = 'ALPHA_CONFIRM',
    EXECUTE = 'ALPHA_EXECUTE'
}

interface AlphaSession {
    state: AlphaState;
    asset?: string;
    direction?: 'BUY' | 'SELL';
    sizeAmount?: number;
    hunch?: string;
    confidence?: number;
    lastActive: number;
}

const TIMEOUT_SECONDS = 30 * 60; // 30 minutes

export class AlphaTradeHandler {
    private static redis = RedisAdapter.getInstance();

    private static async getSession(chatId: number): Promise<AlphaSession> {
        const key = `alpha_session:${chatId}`;
        const data = await this.redis.get(key);
        if (data) {
            return JSON.parse(data);
        }
        return { state: AlphaState.IDLE, lastActive: Date.now() };
    }

    private static async saveSession(chatId: number, session: AlphaSession) {
        const key = `alpha_session:${chatId}`;
        session.lastActive = Date.now();
        await this.redis.set(key, JSON.stringify(session), TIMEOUT_SECONDS);
    }

    private static async clearSession(chatId: number) {
        const key = `alpha_session:${chatId}`;
        await this.redis.del(key);
    }

    /**
     * Entry point: /alpha command
     */
    static async handleAlphaCommand(ctx: Context) {
        const chatId = ctx.chat?.id;
        if (!chatId) return;

        const session = await this.getSession(chatId);
        session.state = AlphaState.ASSET;
        await this.saveSession(chatId, session);

        // Row-based asset picker (v3.2 requirement)
        const buttons = [
            [
                Markup.button.callback('BTC', 'alpha_asset_BTC'),
                Markup.button.callback('ETH', 'alpha_asset_ETH'),
                Markup.button.callback('SOL', 'alpha_asset_SOL'),
                Markup.button.callback('XRP', 'alpha_asset_XRP')
            ],
            [
                Markup.button.callback('DOGE', 'alpha_asset_DOGE'),
                Markup.button.callback('AVAX', 'alpha_asset_AVAX'),
                Markup.button.callback('LINK', 'alpha_asset_LINK')
            ],
            [
                Markup.button.callback('DOT', 'alpha_asset_DOT'),
                Markup.button.callback('AAVE', 'alpha_asset_AAVE'),
                Markup.button.callback('LTC', 'alpha_asset_LTC'),
                Markup.button.callback('UNI', 'alpha_asset_UNI')
            ],
            [
                Markup.button.callback('BNB*', 'alpha_asset_BNB'),
                Markup.button.callback('ADA*', 'alpha_asset_ADA'),
                Markup.button.callback('TRX*', 'alpha_asset_TRX')
            ],
            [
                Markup.button.callback('🔍 OTHER', 'alpha_asset_OTHER')
            ]
        ];

        return ctx.reply('🚀 *ALPHA TRADE FLOW*\nSelect asset for ALPHA trade:', {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
        });
    }

    /**
     * Handles all alpha callbacks
     */
    static async handleCallback(ctx: Context) {
        const query = (ctx.callbackQuery as any).data;
        const chatId = ctx.chat?.id;
        if (!chatId || !query || !query.startsWith('alpha_')) return;

        const session = this.getSession(chatId);
        const parts = query.split('_');
        const type = parts[1]; // asset, direction, size, etc.
        const val = parts[2];

        try {
            switch (type) {
                case 'asset':
                    return this.handleAssetSelection(ctx, session, val);
                case 'dir':
                    return this.handleDirectionSelection(ctx, session, val);
                case 'size':
                    return this.handleSizeSelection(ctx, session, val);
                case 'hcat':
                    return this.handleHunchSelection(ctx, session, val);
                case 'hconf':
                    return this.handleConfidenceSelection(ctx, session, val);
                case 'confirm':
                    return this.handleConfirm(ctx, session, val);
            }
        } catch (e: any) {
            console.error('❌ Alpha Flow Error:', e.message);
            return ctx.reply(`❌ Alpha trade flow failed: ${e.message}`);
        }
    }

    private static async handleAssetSelection(ctx: Context, session: AlphaSession, asset: string) {
        const found = ATS_ASSETS.find(a => a.symbol === asset);
        if (!found) return ctx.answerCbQuery('Asset not found.');

        if (!found.alpacaTradable) {
            return ctx.answerCbQuery(`⚠️ ${asset} is SIGNAL-ONLY. No orders allowed.`, { show_alert: true });
        }

        session.asset = asset;
        session.state = AlphaState.DIRECTION;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📈 BUY', 'alpha_dir_BUY'), Markup.button.callback('📉 SELL', 'alpha_dir_SELL')]
        ]);

        return ctx.editMessageText(`Direction for *${asset}*:`, {
            parse_mode: 'Markdown',
            ...keyboard
        });
    }

    private static async handleDirectionSelection(ctx: Context, session: AlphaSession, direction: string) {
        session.direction = direction as 'BUY' | 'SELL';
        session.state = AlphaState.SIZE;

        const buttons = [
            [
                Markup.button.callback('SMALL 1% (~$400)', 'alpha_size_400'),
                Markup.button.callback('MEDIUM 2.5% (~$1000)', 'alpha_size_1000')
            ],
            [
                Markup.button.callback('LARGE 5% (~$2000)', 'alpha_size_2000'),
                Markup.button.callback('✍️ CUSTOM $', 'alpha_size_CUSTOM')
            ]
        ];

        return ctx.editMessageText(`Position size (ALPHA = $40,000):`, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
        });
    }

    private static async handleSizeSelection(ctx: Context, session: AlphaSession, size: string) {
        if (size === 'CUSTOM') {
            session.state = AlphaState.CUSTOM_AMOUNT;
            return ctx.editMessageText('Enter dollar amount ($100-$5,000):');
        }

        session.sizeAmount = parseInt(size);
        return this.promptHunch(ctx, session);
    }

    private static async promptHunch(ctx: Context, session: AlphaSession) {
        session.state = AlphaState.HUNCH;
        const categories = [
            'STRONG_YES', 'LEAN_YES', 'NEUTRAL', 'LEAN_NO',
            'STRONG_NO', 'PATTERN_SEEN', 'NEWS_AWARE', 'TIMING_FEEL'
        ];

        const keyboard = categories.reduce((acc: any[][], cat, i) => {
            if (i % 2 === 0) acc.push([]);
            acc[acc.length - 1].push(Markup.button.callback(cat.replace('_', ' '), `alpha_hcat_${cat}`));
            return acc;
        }, []);

        return ctx.editMessageText("🧠 *What's driving this trade?*", {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(keyboard)
        });
    }

    private static async handleHunchSelection(ctx: Context, session: AlphaSession, category: string) {
        session.hunch = category;
        session.state = AlphaState.CONFIDENCE;

        const keyboard = [];
        for (let i = 1; i <= 10; i += 5) {
            const row = [];
            for (let j = i; j < i + 5; j++) {
                row.push(Markup.button.callback(j.toString(), `alpha_hconf_${j}`));
            }
            keyboard.push(row);
        }

        return ctx.editMessageText(`🎯 *Confidence Level*\n(1=low, 10=certain):`, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(keyboard)
        });
    }

    private static async handleConfidenceSelection(ctx: Context, session: AlphaSession, confidence: string) {
        session.confidence = parseInt(confidence);
        session.state = AlphaState.CONFIRM;

        const summary = `
🚀 *ALPHA TRADE SUMMARY*
━━━━━━━━━━━━━━━━━━━━
💰 *Asset:* ${session.asset}
📉 *Direction:* ${session.direction}
💵 *Amount:* $${session.sizeAmount}
🧠 *Hunch:* ${session.hunch}
🎯 *Conf:* ${session.confidence}/10

*Execution Mode:* Live Trade (Alpaca)
`;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🚀 EXECUTE', 'alpha_confirm_EXECUTE')],
            [Markup.button.callback('🚫 CANCEL', 'alpha_confirm_CANCEL')]
        ]);

        return ctx.editMessageText(summary, {
            parse_mode: 'Markdown',
            ...keyboard
        });
    }

    private static async handleConfirm(ctx: Context, session: AlphaSession, action: string) {
        if (action === 'CANCEL') {
            this.clearSession(ctx.chat!.id);
            return ctx.editMessageText('❌ Alpha trade cancelled.');
        }

        // EXECUTE
        ctx.editMessageText('⏳ Placing order via Alpaca...');

        try {
            // 1. Real execution
            const { alpacaClient } = await import('../trading/AlpacaClient');

            // Calculate qty based on amount vs current price (simpler for now: use notional if supported, or mock a qty)
            const order = await alpacaClient.placeOrder({
                symbol: `${session.asset}USD`, // Alpaca crypto pairs are BTCUSD, etc.
                notional: session.sizeAmount,
                side: session.direction?.toLowerCase() as 'buy' | 'sell',
                type: 'market',
                time_in_force: 'gtc'
            });

            const orderId = order.id;

            // 2. Log to Hunch Log
            const { error: hErr } = await supabase.from('hitl_hunch_log').insert({
                operator_id: 'Sean (ALPHA)',
                hunch_category: session.hunch,
                confidence_in_self: session.confidence,
                decision_source: 'ALPHA'
            });

            // 3. Log to Trade Execution Log
            const { error: tErr } = await supabase.from('trade_execution_log').insert({
                client_order_id: orderId,
                portfolio: 'ALPHA',
                asset: session.asset,
                side: session.direction?.toLowerCase(),
                expected_amount_usd: session.sizeAmount,
                status: 'SUBMITTED'
            });

            this.clearSession(ctx.chat!.id);

            return ctx.editMessageText(`✅ *ALPHA ORDER EXECUTED*
━━━━━━━━━━━━━━━━━━━━
ID: \`${orderId}\`
Status: Submitted to Alpaca.
Hunch logged for HIAS calibration.`, { parse_mode: 'Markdown' });

        } catch (e: any) {
            return ctx.reply(`❌ Order placement failed: ${e.message}`);
        }
    }

    /**
     * Handles custom numeric input for size
     */
    static async handleTextInput(ctx: Context) {
        const chatId = ctx.chat?.id;
        if (!chatId) return false;

        const session = SESSIONS.get(chatId);
        if (!session || session.state !== AlphaState.CUSTOM_AMOUNT) return false;

        const amt = parseFloat((ctx.message as any).text);
        if (isNaN(amt) || amt < 100 || amt > 5000) {
            ctx.reply('⚠️ Please enter a valid number between 100 and 5000.');
            return true;
        }

        session.sizeAmount = amt;
        await this.promptHunch(ctx, session);
        return true;
    }
}
