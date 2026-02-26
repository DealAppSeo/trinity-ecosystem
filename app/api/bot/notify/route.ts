import { NextRequest, NextResponse } from 'next/server';
import { bot } from '@/lib/telegram/bot';

/**
 * n8n Notification Bridge
 * Allows external workflows (n8n, Flowise) to push messages to the System Owner/Admins.
 */
export async function POST(req: NextRequest) {
    const authHeader = req.headers.get('Authorization');
    const secretToken = process.env.TELEGRAM_SECRET_TOKEN;

    // Optional: Simple token check if n8n is sending it
    if (secretToken && authHeader !== `Bearer ${secretToken}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { message, level, metadata } = await req.json();

        if (!message) {
            return NextResponse.json({ error: 'Message content is required' }, { status: 400 });
        }

        const OWNER_ID = process.env.TELEGRAM_OWNER_CHAT_ID;
        if (!OWNER_ID) {
            throw new Error('TELEGRAM_OWNER_CHAT_ID not configured');
        }

        const emojiMap: Record<string, string> = {
            'info': 'ℹ️',
            'warning': '⚠️',
            'error': '🚨',
            'success': '✅',
            'judas': '🧛‍♂️ [JUDAS ALERT]'
        };

        const emoji = emojiMap[level?.toLowerCase()] || '📡';
        const formattedMessage = `
${emoji} *Trinity Alert System*
━━━━━━━━━━━━━━━━━━━━
${message}

${metadata ? '```json\n' + JSON.stringify(metadata, null, 2) + '\n```' : ''}
`;

        await bot.telegram.sendMessage(OWNER_ID, formattedMessage, { parse_mode: 'Markdown' });

        return NextResponse.json({ ok: true, sent: true });
    } catch (error: any) {
        console.error('[Bot Notify Bridge Error]:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
