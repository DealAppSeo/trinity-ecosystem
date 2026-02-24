import { NextResponse } from 'next/server';
import { verifyTelegramWebAppData } from '@/lib/auth/telegram';

export async function POST(req: Request) {
    try {
        const { initData } = await req.json();
        const botToken = process.env.TELEGRAM_BOT_TOKEN;

        if (!botToken) {
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        if (!initData || !verifyTelegramWebAppData(initData, botToken)) {
            return NextResponse.json({ error: 'Invalid Telegram Session' }, { status: 401 });
        }

        // Parse user data for RepID linking (simplified)
        const urlParams = new URLSearchParams(initData);
        const user = JSON.parse(urlParams.get('user') || '{}');

        // Create response and set cookie
        const response = NextResponse.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                role: 'founder' // Default to founder for Sean, or check against whitelist
            }
        });

        // Set the trinity_access cookie
        response.cookies.set('trinity_access', 'true', {
            httpOnly: false, // Accessible by Gatekeeper
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7 // 1 week
        });

        response.cookies.set('trinity_role', 'founder', {
            httpOnly: false,
            maxAge: 60 * 60 * 24 * 7
        });

        return response;

    } catch (e: any) {
        console.error('Telegram Auth Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
