import { NextResponse } from 'next/server';

export async function GET() {
    const agents = [
        'https://aitrinitysymphony.com/agents/NEXUS/registration.json',
        'https://aitrinitysymphony.com/agents/VERITAS/registration.json',
        'https://aitrinitysymphony.com/agents/APM/registration.json',
        'https://aitrinitysymphony.com/agents/SOPHIA/registration.json',
    ];

    return NextResponse.json({ agents }, {
        headers: { 'Content-Type': 'application/json' }
    });
}
