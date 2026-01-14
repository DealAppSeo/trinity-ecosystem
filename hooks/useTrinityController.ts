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

            const res = await fetch(`${baseUrl}/`, { signal: controller.signal }).catch(() => null);
            clearTimeout(timeoutId);

            setBrainStatus(res?.ok ? 'online' : 'offline');
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
                supabase.from('trinity_tasks').select('*').order('created_at', { ascending: false }).limit(50),
                supabase.from('trinity_agent_logs').select('*').order('created_at', { ascending: false }).limit(50),
                supabase.from('trinity_heartbeat').select('*'),
                supabase.from('trinity_stats').select('*').single() // Assuming a stats table or view exists
            ]);

            // Enrich Agent Data with Group and Status
            const taskMap = new Map((taskData || []).map((t: any) => [t.assigned_to, t]));

            const enrichedAgents = (agentData || []).map((agent: any) => {
                const currentTask = taskMap.get(agent.agent_name);
                const heartbeat = (heartbeatData || []).find((h: any) => h.agent === agent.agent_name);

                // Determine group if missing
                let groupName = agent.group_name;
                if (!groupName) {
                    const group = getGroupForAgent(agent.agent_name);
                    if (group) groupName = group.id;
                }

                // Determine Status: If heartbeat is recent (< 30s), active. Else offline.
                // Or use the status column if reliable.
                const shortName = agent.agent_name.replace('trinity-', '').toUpperCase();
                const matchedHeartbeat = heartbeatData?.find(h =>
                    h.agent === agent.agent_name ||
                    h.agent === shortName ||
                    h.agent === `trinity-${shortName.toLowerCase()}`
                );

                /* DEBUG: Offline Investigation */
                if (agent.agent_name === 'trinity-hdm') {
                    console.log(`[DEBUG] Agent: ${agent.agent_name}`, { matchedHeartbeat, now: new Date().toISOString() });
                }

                const isLive = matchedHeartbeat && (new Date().getTime() - new Date(matchedHeartbeat.last_seen).getTime() < 120000); // Increased tolerance to 2 mins for safety

                return {
                    ...agent,
                    group_name: groupName,
                    status: isLive ? 'active' : 'offline',
                    currentTask: currentTask || null,
                    lastHeartbeat: heartbeat ? heartbeat.last_seen : null,
                    reputation_score: agent.reputation_score || 0,
                    tasks_completed: agent.tasks_completed || 0
                };
            });

            // Sort: Active first, then by name
            enrichedAgents.sort((a: any, b: any) => {
                if (a.status === 'active' && b.status !== 'active') return -1;
                if (a.status !== 'active' && b.status === 'active') return 1;
                return a.agent_name.localeCompare(b.agent_name);
            });

            if (enrichedAgents.length > 0) setAgents(enrichedAgents as AgentRegistryRecord[]);
            if (taskData) setTasks(taskData as unknown as TaskRecord[]);
            if (logData) setLogs(logData);
            if (heartbeatData) setHeartbeats(heartbeatData);

            // Set stats - PREFER DYNAMIC CALCULATION for Active Agents to match Grid
            // Fallback to table for accumulated stats like tasks_completed_24h if meaningful
            const calculatedActiveAgents = enrichedAgents.filter((a: any) => a.status === 'active').length;
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
