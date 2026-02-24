import { NextResponse } from 'next/server';
import { HITLCallbackHandler } from '@/lib/hitl/HITLCallbackHandler';

export async function POST(req: Request) {
    try {
        const body = await req.json();

        // Log webhook body for debugging (view in Railway logs)
        console.log('📬 [Telegram Webhook] Received:', JSON.stringify(body));

        // Handle Callback Queries (Button clicks)
        if (body.callback_query) {
            await HITLCallbackHandler.handleTelegramCallback(body);
        }

        // Handle Messages (e.g. /start)
        if (body.message && body.message.text === '/start') {
            const chatId = body.message.chat.id;
            await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: '🎼 *AI Trinity Symphony Controller Online*\n\nYou are verified as the system conductor. I will send escalation alerts here.',
                    parse_mode: 'Markdown'
                })
            });
        }

        return NextResponse.json({ ok: true });

    } catch (e: any) {
        console.error('❌ Webhook Route Error:', e.message);
        // Always return 200 to Telegram to prevent retry loops
        return NextResponse.json({ ok: false, error: e.message }, { status: 200 });
    }
}
