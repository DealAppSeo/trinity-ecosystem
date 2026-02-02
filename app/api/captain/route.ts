import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { verifyAdminKey, unauthorizedResponse } from '@/lib/auth';

// FORCE DYNAMIC
export const dynamic = 'force-dynamic';

export async function GET() {
    // GET might be okay to keep public for read-only config, but let's see.
    // The previous GET was just returning trinity_system_config.
    // I'll leave GET public for now unless it has sensitive data.
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
        // [SECURITY] TRINITY_ADMIN_KEY Verification
        if (!verifyAdminKey(req)) {
            return unauthorizedResponse();
        }

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
                const { data: agentsData } = await supabase.from('trinity_agent_registry').select('agent_name');
                const agentNames = agentsData?.map(a => a.agent_name) || [];

                if (agentNames.length > 0) {
                    const nowStr = new Date().toISOString();
                    const pings = agentNames.map(name => ({
                        title: `[HEARTBEAT] System Wake Signal`,
                        description: 'Manual wake signal from Conductor Dashboard.',
                        task_type: 'heartbeat',
                        status: 'pending',
                        assigned_to: name, // Specifically assigned to help them wake selectively
                        priority: 5,
                        created_at: nowStr
                    }));

                    // 2. Insert Heartbeat/Wake tasks
                    await supabase.from('trinity_tasks').insert(pings);

                    // 3. Update registry last_active to show immediate pulse
                    await supabase.from('trinity_agent_registry')
                        .update({
                            status: 'online',
                            last_active: nowStr
                        })
                        .in('agent_name', agentNames);

                    // 4. Update heartbeats
                    const heartbeats = agentNames.map(agent => ({
                        agent,
                        last_seen: nowStr,
                        status: 'active'
                    }));
                    await supabase.from('trinity_heartbeat').upsert(heartbeats, { onConflict: 'agent' });
                }

                if (process.env.RAILWAY_DEPLOY_HOOK) {
                    await fetch(process.env.RAILWAY_DEPLOY_HOOK, { method: 'POST' });
                }

                return NextResponse.json({ message: 'SYSTEM_WAKE signal dispatched. All nodes marked ACTIVE.' });
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
