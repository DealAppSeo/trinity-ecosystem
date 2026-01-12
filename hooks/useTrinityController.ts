import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { AgentRegistryRecord, TaskRecord } from '@/lib/agent/types';
import { getGroupForAgent } from '@/lib/agent/groups';

export const useTrinityController = () => {
    const [agents, setAgents] = useState<AgentRegistryRecord[]>([]);
    const [tasks, setTasks] = useState<TaskRecord[]>([]);
    const [logs, setLogs] = useState<any[]>([]);
    const [heartbeats, setHeartbeats] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const channelRef = useRef<any>(null);

    const fetchData = useCallback(async () => {
        try {
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
                // Or use the status column if reliable. For now, let's trust the heartbeat for "live" status.
                const isLive = heartbeat && (new Date().getTime() - new Date(heartbeat.last_seen).getTime() < 30000);

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

            if (enrichedAgents.length > 0) setAgents(enrichedAgents as AgentRegistryRecord[]);
            if (taskData) setTasks(taskData as unknown as TaskRecord[]);
            if (logData) setLogs(logData);
            if (heartbeatData) setHeartbeats(heartbeatData);

            // Set stats - fallback if table empty
            setStats(statsData || {
                active_agents: enrichedAgents.filter((a: any) => a.status === 'active').length,
                tasks_completed_24h: enrichedAgents.reduce((acc: number, curr: any) => acc + (curr.tasks_completed || 0), 0)
            });

        } catch (error) {
            console.error('Error fetching Trinity data:', error);
        } finally {
            setLoading(false);
        }
    }, []);

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
            .subscribe((status) => {
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
        refresh: fetchData
    };
};
