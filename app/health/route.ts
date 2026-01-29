import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json(
        {
            status: 'online',
            timestamp: new Date().toISOString(),
            service: 'trinity-ecosystem-controller',
            version: '8.1.3'
        },
        { status: 200 }
    );
}

// Next.js automatically handles HEAD for GET routes, 
// but we explicitly define it for maximum clarity with UptimeRobot.
export async function HEAD() {
    return new Response(null, { status: 200 });
}
