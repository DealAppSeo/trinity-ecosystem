import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { verifyAdminKey, unauthorizedResponse } from '@/lib/auth';

// FORCE DYNAMIC
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        // [SECURITY] TRINITY_ADMIN_KEY Verification
        // PWA button calls /api/admin/wake with x-trinity-admin-key header
        // Server validates without exposing key to client bundle
        if (!verifyAdminKey(req)) {
            return unauthorizedResponse();
        }

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
                assigned_to: name,
                priority: 5,
                created_at: nowStr
            }));

            // 2. Insert Heartbeat/Wake tasks
            await supabase.from('trinity_tasks').insert(pings);

            // 3. Update registry last_active
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
            await fetch(process.env.RAILWAY_DEPLOY_HOOK, { method: 'POST' }).catch(() => {});
        }

        return NextResponse.json({ success: true, message: 'SYSTEM_WAKE signal dispatched securely via PWA.' });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
