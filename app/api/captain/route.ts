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
            const { signal } = body;

            if (signal === 'SYSTEM_WAKE') {
                // 1. Get all agents from registry
                const { data: agents } = await supabase.from('trinity_agent_registry').select('agent_name');
                const agentNames = agents?.map(a => a.agent_name) || [];

                // 2. Insert Heartbeat/Wake tasks for each agent
                if (agentNames.length > 0) {
                    const pings = agentNames.map(name => ({
                        title: `[HEARTBEAT] System Wake Signal`,
                        description: 'Manual wake signal from Conductor Dashboard.',
                        task_type: 'heartbeat',
                        status: 'pending',
                        assigned_to: name,
                        priority: 1
                    }));
                    await supabase.from('trinity_tasks').insert(pings);

                    // Update registry last_active to show immediate pulse
                    await supabase.from('trinity_agent_registry')
                        .update({ last_active: new Date().toISOString() })
                        .in('agent_name', agentNames);
                }

                if (process.env.RAILWAY_DEPLOY_HOOK) {
                    await fetch(process.env.RAILWAY_DEPLOY_HOOK, { method: 'POST' });
                }

                return NextResponse.json({ message: 'SYSTEM_WAKE signal dispatched to all agents.' });
            }

            if (signal === 'SYSTEM_RESET') {
                // 1. Reset all tasks in progress
                await supabase.from('trinity_tasks')
                    .update({
                        status: 'pending',
                        claimed_by: null,
                        claimed_at: null,
                        assigned_to: null,
                        metadata: { reset_reason: 'MANUAL_REBOOT' }
                    })
                    .in('status', ['doing', 'in_progress', 'pending_clarification']);

                // 2. Mark all agents offline
                await supabase.from('trinity_agent_registry')
                    .update({ status: 'offline' })
                    .neq('agent_name', 'RESERVED');

                return NextResponse.json({ message: 'SYSTEM_RESET completed. Swarm state cleared.' });
            }

            // Fallback for other signals
            const { data, error } = await supabase
                .from('trinity_signals')
                .insert({
                    signal_type: signal,
                    payload: { triggered_by: 'CAPTAIN' }
                })
                .select()
                .single();

            if (error) throw error;
            return NextResponse.json(data);
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
