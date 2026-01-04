import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// FORCE DYNAMIC
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('trinity_system_config')
            .select('*')
            .single();

        if (error) throw error;
        return NextResponse.json(data);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { action, north_star, signal } = body;

        if (action === 'UPDATE_NORTH_STAR') {
            const { data, error } = await supabase
                .from('trinity_system_config')
                .update({ north_star_directive: north_star, updated_at: new Date() })
                .eq('id', 1)
                .select()
                .single();

            if (error) throw error;
            return NextResponse.json(data);
        }

        if (action === 'SEND_SIGNAL') {
            // e.g. signal = 'SYSTEM_WAKE'
            const { data, error } = await supabase
                .from('trinity_signals')
                .insert({
                    signal_type: signal,
                    payload: { triggered_by: 'CAPTAIN' }
                })
                .select()
                .single();

            // TODO: If we had a Railway Webhook, we would fire it here too.
            if (signal === 'SYSTEM_WAKE' && process.env.RAILWAY_DEPLOY_HOOK) {
                console.log('Firing Railway Deploy Hook...');
                await fetch(process.env.RAILWAY_DEPLOY_HOOK, { method: 'POST' });
            }

            if (error) throw error;
            return NextResponse.json(data);
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
