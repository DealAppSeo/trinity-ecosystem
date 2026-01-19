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
    const [loading, setLoading] = useState(true);
    const [brainStatus, setBrainStatus] = useState<'online' | 'offline'>('offline');
    const channelRef = useRef<any>(null);

    const checkBrain = useCallback(async () => {
        try {
            const baseUrl = process.env.NEXT_PUBLIC_TRINITY_SCIENCE_URL || 'http://localhost:8000';
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
            const [
                { data: agentData },
                { data: taskData },
                { data: logData },
                { data: heartbeatData },
                { data: statsData }
            ] = await Promise.all([
                supabase.from('trinity_agent_registry').select('*').order('agent_name'),
                supabase.from('trinity_tasks').select('*').order('created_at', { ascending: false }).limit(150),
                supabase.from('trinity_agent_logs').select('*').order('created_at', { ascending: false }).limit(100),
                supabase.from('trinity_heartbeat').select('*'),
                supabase.from('trinity_stats').select('*').single() // Assuming a stats table or view exists
            ]);

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
                const isActive = minutesIdle < 5; // 5 mins active window
                const isIdle = minutesIdle >= 10 && minutesIdle < 60; // Amber threshold

                // Tiered Logic
                // Green: Active + Has recent task activity
                // Blue: Active + Awaiting Peer Review
                // Amber: Active but Idle
                // Offline: > 1 hour or no status

                let tierStatus = 'offline';
                if (isActive) {
                    const hasDoneTask = taskList.some(t => t.claimed_by === agent.agent_name && t.status === 'done');
                    const hasVerifiedTask = taskList.some(t => t.claimed_by === agent.agent_name && t.status === 'verified');
                    const needsClarification = taskList.some(t => t.claimed_by === agent.agent_name && t.status === 'pending_clarification');

                    if (needsClarification) tierStatus = 'amber'; // Amber pulse for clarification
                    else if (hasDoneTask) tierStatus = 'blue';
                    else if (hasVerifiedTask) tierStatus = 'green';
                    else tierStatus = 'active'; // Default active (Greener/Live)
                } else if (isIdle) {
                    tierStatus = 'amber';
                }

                return {
                    ...agent,
                    group_name: agent.group_name || getGroupForAgent(agent.agent_name)?.id || 'UNKNOWN',
                    status: tierStatus,
                    is_live: isActive,
                    currentTask: currentTask || null,
                    lastHeartbeat: lastSeen,
                    reputation_score: agent.reputation_score || 0,
                    tasks_completed: agent.tasks_completed || 0
                };
            });

            // Sort: Live first, then by name
            enrichedAgents.sort((a: any, b: any) => {
                if (a.is_live && !b.is_live) return -1;
                if (!a.is_live && b.is_live) return 1;
                return a.agent_name.localeCompare(b.agent_name);
            });

            if (enrichedAgents.length > 0) setAgents(enrichedAgents as AgentRegistryRecord[]);
            if (taskData) setTasks(taskData as unknown as TaskRecord[]);
            if (logData) setLogs(logData);
            if (heartbeatData) setHeartbeats(heartbeatData);

            // Set stats - PREFER DYNAMIC CALCULATION for Active Agents to match Grid
            // Fallback to table for accumulated stats like tasks_completed_24h if meaningful
            const calculatedActiveAgents = enrichedAgents.filter((a: any) => ['active', 'green', 'blue'].includes(a.status)).length;
            const calculatedCompleted = enrichedAgents.reduce((acc: number, curr: any) => acc + (curr.tasks_completed || 0), 0);

            setStats({
                ...statsData, // Keep other stats if they exist
                active_agents: calculatedActiveAgents,
                tasks_completed_24h: calculatedCompleted // Sync Total Tasks too
            });

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
        const debouncedRefresh = () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                fetchData();
            }, 500);
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
