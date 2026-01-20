
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    if (!supabase) {
        return NextResponse.json({ success: false, error: 'Supabase not initialized' }, { status: 500 });
    }
    try {
        const { agent_name, action, suggestion } = await request.json();

        console.log(`⚖️ Governance Action: [${action}] for ${agent_name}`);

        if (action === 'accept') {
            const { error } = await supabase.from('trinity_agent_registry').update({
                system_prompt: suggestion,
                directive_source: 'human',
                suggested_prompt: null,
                suggestion_accepted: true,
                suggestion_timestamp: new Date().toISOString()
            }).eq('agent_name', agent_name);

            if (error) throw error;
            return NextResponse.json({ success: true, message: 'Suggestion Accepted' });

        } else if (action === 'reject') {
            const { error } = await supabase.from('trinity_agent_registry').update({
                suggested_prompt: null,
                suggestion_accepted: false
            }).eq('agent_name', agent_name);

            if (error) throw error;
            return NextResponse.json({ success: true, message: 'Suggestion Rejected' });
        }

        return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });

    } catch (error: any) {
        console.error('Governance Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
