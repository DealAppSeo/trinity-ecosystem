import { NextRequest, NextResponse } from 'next/server';
import { handleUpdate } from '@/lib/telegram/bot';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const secretToken = process.env.TELEGRAM_SECRET_TOKEN;
    if (secretToken) {
        const headerToken = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
        if (headerToken !== secretToken) {
            console.warn('[Telegram Webhook] ⛔ Invalid secret token provided.');
            return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
        }
    }

    try {
        const body = await req.json();
        await handleUpdate(body);
        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error('[Telegram Webhook Error]:', error.message);
        // We still return 200 OK to Telegram so it doesn't keep retrying and flooding us
        return NextResponse.json({ ok: true });
    }
}

export async function GET() {
    return NextResponse.json({ status: 'Telegram Bot Webhook is active' });
}
