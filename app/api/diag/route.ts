
import { NextResponse } from 'next/server';

export async function GET() {
    const diag = {
        hasUrl: !!(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL),
        hasKey: !!(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY),
        nodeEnv: process.env.NODE_ENV,
        publicUrlPrefix: (process.env.NEXT_PUBLIC_SUPABASE_URL || '').substring(0, 10),
        timestamp: new Date().toISOString()
    };

    return NextResponse.json(diag);
}
