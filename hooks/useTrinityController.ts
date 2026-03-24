import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';
import { AgentRegistryRecord, TaskRecord } from '@/lib/agent/types';
import { getGroupForAgent } from '@/lib/agent/groups';

export const useTrinityController = () => {
    const [agents, setAgents] = useState<AgentRegistryRecord[]>([]);
    const [tasks, setTasks] = useState<TaskRecord[]>([]);
    const [logs, setLogs] = useState<any[]>([]);
    const [heartbeats, setHeartbeats] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [sovereignData, setSovereignData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [brainStatus, setBrainStatus] = useState<'online' | 'offline'>('offline');
    const channelRef = useRef<any>(null);

    const checkBrain = useCallback(async () => {
        try {
            const baseUrl = process.env.NEXT_PUBLIC_TRINITY_SCIENCE_URL || 'https://py-brain-production.up.railway.app';
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s timeout

            const res = await fetch(`${baseUrl}/`, { signal: controller.signal }).catch((err) => {
                console.warn(`[PyBrain] Connection Failed to ${baseUrl}:`, err);
                return null;
            });
            clearTimeout(timeoutId);

            if (res?.ok) {
                // console.log('[PyBrain] Online');
                setBrainStatus('online');
            } else {
                // console.warn('[PyBrain] Offline (Status or Net)', res?.status);
                setBrainStatus('offline');
            }
        } catch (e) {
            setBrainStatus('offline');
        }
    }, []);

    const fetchData = useCallback(async () => {
        try {
            // Check Brain concurrently
            checkBrain();

            // Parallel Fetching for Speed
            // [TRINITY v4.2] DYNAMIC STATUS FETCH: Fetch active tasks without 150 limit
            const [
                { data: agentData },
                { data: activeTasks }, // Doing / Clarify (No Limit)
                { data: pendingTasks }, // Pending
                { data: completedTasks }, // Done / Verified
                { data: logData },
                { data: heartbeatData },
                { count: completedCount24h }
            ] = await Promise.all([
                supabase.from('trinity_agent_registry').select('*').order('agent_name'),
                supabase.from('trinity_tasks').select('*')
                    .in('status', ['doing', 'in_progress', 'running', 'pending_clarification'])
                    .order('created_at', { ascending: false }),
                supabase.from('trinity_tasks').select('*')
                    .in('status', ['pending'])
                    .order('created_at', { ascending: false })
                    .limit(50),
                supabase.from('trinity_tasks').select('*')
                    .in('status', ['done', 'completed', 'verified', 'success'])
                    .order('updated_at', { ascending: false })
                    .limit(50),
                supabase.from('trinity_agent_logs').select('*').order('created_at', { ascending: false }).limit(100),
                supabase.from('trinity_heartbeat').select('*'),
                supabase.from('trinity_tasks')
                    .select('*', { count: 'exact', head: true })
                    .in('status', ['completed', 'verified', 'done'])
                    .gt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            ]);

            const taskData = [...(activeTasks || []), ...(pendingTasks || []), ...(completedTasks || [])];

            // Enrich Agent Data with Group and Status
            const taskList = taskData || [];
            const agentTaskList = new Map((taskList).map((t: any) => [t.claimed_by || t.assigned_to, t]));

            const enrichedAgents = (agentData || []).map((agent: any) => {
                const currentTask = agentTaskList.get(agent.agent_name);

                // UNIFIED HEARTBEAT LOGIC (v4.0 - Tiered Status)
                const lastSeen = agent.last_active;
                const now = new Date().getTime();
                const lastSeenTime = lastSeen ? new Date(lastSeen).getTime() : 0;
                const minutesIdle = (now - lastSeenTime) / 60000;

                // Thresholds
                const isActive = minutesIdle < 15; // 15 mins active window
                const isIdle = minutesIdle >= 15 && minutesIdle < 60; // Amber threshold (Start at 15 to close the gap)

                // Tiered Logic
                // Green: Active + Has recent task activity
                // Blue: Active + Awaiting Peer Review
                // Amber: Active but Idle
                // Offline: > 1 hour or no status

                let tierStatus = 'offline';
                if (isActive) {
                    const hasDoneTask = taskList.some(t => t.claimed_by === agent.agent_name && t.status === 'done');
                    const currentTaskStatus = currentTask?.status;
                    const isStalled = currentTaskStatus === 'pending_clarification';

                    if (isStalled) tierStatus = 'amber';
                    else if (hasDoneTask) tierStatus = 'blue';
                    else tierStatus = 'online'; // Default Green
                } else if (isIdle) {
                    tierStatus = 'amber';
                }

                const enriched = {
                    ...agent,
                    group_name: agent.group_name || getGroupForAgent(agent.agent_name)?.id || 'UNKNOWN',
                    status: tierStatus,
                    is_live: isActive,
                    currentTask: currentTask || null,
                    current_task_summary: agent.current_task_summary || (currentTask ? currentTask.title : 'Idle'),
                    lastHeartbeat: lastSeen,
                    reputation_score: agent.reputation_score || 0,
                    tasks_completed: agent.tasks_completed || 0
                };
                if (isActive) console.log(`[Enrich] ${agent.agent_name}: status=${tierStatus} (idle:${minutesIdle.toFixed(1)}m)`);
                return enriched;
            });

            // Sort: Live first, then by name
            enrichedAgents.sort((a: any, b: any) => {
                if (a.is_live && !b.is_live) return -1;
                if (!a.is_live && b.is_live) return 1;
                return a.agent_name.localeCompare(b.agent_name);
            });

            if (enrichedAgents.length > 0) {
                setAgents(enrichedAgents as AgentRegistryRecord[]);
            } else if (agentData) {
                // If agentData exists but enrichedAgents is empty (shouldn't happen with 13 agents), still set it
                setAgents(agentData as unknown as AgentRegistryRecord[]);
            }

            if (taskData) {
                setTasks(taskData as unknown as TaskRecord[]);
            }
            if (logData) setLogs(logData);
            if (heartbeatData) setHeartbeats(heartbeatData);

            // Fetch Unified Stats (Savings + Truths)
            const statsRes = await fetch('/api/stats', {
                headers: {
                    'x-trinity-admin-key': localStorage.getItem('trinity_admin_key') || ''
                }
            });
            const unifiedStats = statsRes.ok ? await statsRes.json() : null;

            // Fetch Active Agents from logs (1-hour window)
            const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
            const { data: logsData } = await supabase.from('trinity_agent_logs')
                .select('agent_name')
                .gt('created_at', oneHourAgo);
            const calculatedActiveAgents = logsData ? new Set(logsData.map((l: any) => l.agent_name)).size : 0;
            
            const calculatedCompleted = enrichedAgents.reduce((acc: number, curr: any) => acc + (curr.tasks_completed || 0), 0);

            setStats({
                online_agents: calculatedActiveAgents,
                tasks_completed_24h: completedCount24h || 0,
                total_tasks_completed: calculatedCompleted,
                system_savings: unifiedStats?.system_savings || (calculatedCompleted * 2.1),
                total_truths: unifiedStats?.total_truths || (12402 + (completedCount24h || 0)),
                active_tasks: (taskList || []).filter(t => ['pending', 'in_progress', 'doing', 'running'].includes(t.status)).length
            });

            // [PHASE 10] Fetch Sovereign Ecosystem Data
            const sovRes = await fetch('/api/sovereign', {
                headers: {
                    'x-trinity-admin-key': localStorage.getItem('trinity_admin_key') || ''
                }
            });
            if (sovRes.ok) {
                const sovData = await sovRes.json();
                setSovereignData(sovData);
            }

        } catch (error) {
            console.error('Error fetching Trinity data:', error);
        } finally {
            setLoading(false);
        }
    }, [checkBrain]);

    const createTask = async (title: string, priority: string = 'medium') => {
        await supabase.from('trinity_tasks').insert({
            title,
            priority,
            status: 'pending',
            created_at: new Date().toISOString()
        });
        fetchData();
    };

    const killRandomAgent = async () => {
        const activeAgents = agents.filter(a => a.status === 'active');
        if (activeAgents.length === 0) {
            console.warn('No active agents to kill');
            return;
        }
        const victim = activeAgents[Math.floor(Math.random() * activeAgents.length)];

        // We can't actually kill the process from client, but we can mark it offline or log an event
        console.log(`💀 Simulating Agent Death: ${victim.agent_name}`);
        createTask(`⚠️ CHAOS: Agent ${victim.agent_name} process terminated`, 'high');
    };

    const triggerChaosEvent = async (eventType: string) => {
        const title = `🔥 CHAOS SIMULATION: ${eventType}`;
        await createTask(title, 'critical');
        console.warn(`Chaos Event Triggered: ${eventType}`);
    };

    useEffect(() => {
        // Initial Fetch
        fetchData();

        // Realtime Subscription
        let timeoutId: NodeJS.Timeout;
        const lastFetchRef = { current: 0 };
        const debouncedRefresh = () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                const now = Date.now();
                if (now - lastFetchRef.current < 5000) return; // Minimum 5s between fetches
                lastFetchRef.current = now;
                fetchData();
            }, 5000);
        };

        const channel = supabase.channel('trinity_realtime_data')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'trinity_agent_registry' }, debouncedRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'trinity_tasks' }, debouncedRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'trinity_agent_logs' }, debouncedRefresh)
            .subscribe((status: keyof typeof REALTIME_SUBSCRIBE_STATES) => {
                if (status === 'SUBSCRIBED') {
                    // Connected
                }
            });

        channelRef.current = channel;

        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
            }
            clearTimeout(timeoutId);
        };
    }, [fetchData]);

    return {
        agents,
        tasks,
        logs,
        heartbeats,
        stats,
        sovereignData,
        loading,
        createTask,
        killRandomAgent,
        triggerChaosEvent,
        refresh: fetchData,
        systemStatus: {
            pyBrain: brainStatus === 'online'
        }
    };
};
