import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { verifyAdminKey, unauthorizedResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        // [SECURITY] TRINITY_ADMIN_KEY Verification
        if (!verifyAdminKey(req)) {
            return unauthorizedResponse();
        }

        const body = await req.json();
        const { action } = body;

        if (action === 'REBOOT_SWARM') {
            // Seed 12 keep-alive tasks to force agents to wake up
            const agents = [
                'trinity-orch', 'trinity-w3c', 'trinity-shofet',
                'trinity-torch', 'trinity-veritas', 'trinity-gcm',
                'trinity-chesed', 'trinity-mel', 'trinity-apm',
                'trinity-sophia', 'trinity-nexus', 'trinity-hdm'
            ];

            const nowStr = new Date().toISOString();

            const wakeTasks = agents.map(agent => ({
                title: `[WAKE] Priority Pulse for ${agent}`,
                description: 'System-wide keep-alive signal. Verify connection and resume tasking.',
                priority: 10,
                status: 'pending',
                assigned_to: agent,
                created_at: nowStr,
                created_by: 'FOUNDER'
            }));

            // 1. Insert wake tasks
            const { error: taskError } = await supabase.from('trinity_tasks').insert(wakeTasks);
            if (taskError) throw taskError;

            // 2. Force update registry
            await supabase
                .from('trinity_agent_registry')
                .update({ status: 'online', last_active: nowStr })
                .in('agent_name', agents);

            // 3. Force update heartbeats
            const heartbeats = agents.map(agent => ({
                agent,
                last_seen: nowStr,
                status: 'active'
            }));
            await supabase.from('trinity_heartbeat').upsert(heartbeats, { onConflict: 'agent' });

            // 4. Force update agent_status (UI SSOT)
            const statusUpdates = agents.map(agent => ({
                agent_name: agent,
                status: 'online',
                last_active: nowStr,
                current_task: '[REBOOT] Swarm wake signal received.'
            }));
            await supabase.from('agent_status').upsert(statusUpdates, { onConflict: 'agent_name' });

            return NextResponse.json({ message: 'Swarm wake signal dispatched. All nodes marked ONLINE.' });
        }

        if (action === 'FLUSH_GHOSTS') {
            // Atomic reset of any stuck or legacy-claimed tasks
            const { error } = await supabase
                .from('trinity_tasks')
                .update({
                    status: 'pending',
                    claimed_by: null,
                    assigned_to: null,
                    claimed_at: null,
                    started_at: null,
                    result: null
                })
                .not('status', 'in', ['done', 'verified', 'failed']);

            if (error) throw error;
            return NextResponse.json({ message: 'Ghosts flushed. Task board reset.' });
        }

        if (action === 'WIPE_ALL') {
            // Nuclear reset - cleared board
            const { error } = await supabase
                .from('trinity_tasks')
                .delete()
                .not('status', 'in', ['done', 'verified']);

            if (error) throw error;
            return NextResponse.json({
                success: true,
                message: 'Nuclear wipe complete. Board cleared of non-final tasks.'
            });
        }

        if (action === 'DIRECTIVE_UPDATE') {
            const { targetAgents, prompt } = body;
            if (!targetAgents || !Array.isArray(targetAgents)) {
                return NextResponse.json({ error: 'targetAgents array required' }, { status: 400 });
            }

            const { error } = await supabase
                .from('trinity_agent_registry')
                .update({ system_prompt: prompt })
                .in('agent_name', targetAgents);

            if (error) throw error;
            return NextResponse.json({ message: `Directive injected into ${targetAgents.length} neural nodes.` });
        }

        if (action === 'SEED_EVERGREEN') {
            const evergreenTasks = [
                {
                    title: "[EVERGREEN] Swarm Ethics & Virtue Alignment Audit",
                    description: "Analyze the last 50 agent artifacts for 'Resurrection' mentality and Subjective Slashing adherence. Generate a Virtue Resonance Report.",
                    priority: 5,
                    status: 'pending',
                    task_type: 'audit',
                    created_at: new Date().toISOString()
                },
                {
                    title: "[EVERGREEN] Ecosystem Integration: Founder App UX Heatmap",
                    description: "Analyze user interaction with the 'Amber Pulse' and 'Blue Verification' indicators. Propose UX refinements for the mobile-first dashboard.",
                    priority: 5,
                    status: 'pending',
                    task_type: 'design',
                    created_at: new Date().toISOString()
                }
            ];

            const { error } = await supabase.from('trinity_tasks').insert(evergreenTasks);
            if (error) throw error;

            return NextResponse.json({ message: 'Evergreen tasks seeded successfully.' });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
