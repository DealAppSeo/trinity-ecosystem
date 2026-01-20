import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        if (!supabase) {
            throw new Error('Supabase client not initialized. Missing environment variables.');
        }

        const { data, error } = await supabase
            .from('sandbox_agent_state')
            .select('*')
            .order('updated_at', { ascending: false });

        if (error) {
            console.error('Supabase Error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ agents: data });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
