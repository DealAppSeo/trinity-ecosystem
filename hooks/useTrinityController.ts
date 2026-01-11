import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { AgentRegistryRecord, Task } from '@/lib/agent/types';
import { RealtimeChannel } from '@supabase/supabase-js';

export function useTrinityController() {
    const [agents, setAgents] = useState<AgentRegistryRecord[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [logs, setLogs] = useState<any[]>([]);
    const [heartbeats, setHeartbeats] = useState<any[]>([]);
    const [stats, setStats] = useState({ online_agents: 0, tasks_completed_24h: 0, active_tasks: 0 });

    // Ref to track subscription to avoid duplicates
    const channelRef = useRef<RealtimeChannel | null>(null);

    const fetchData = useCallback(async () => {
        // Don't set loading=true on background refreshes, only initial or manual
        // We'll manage loading state more subtly if needed, but for now keeping it simple.
        // If we set loading=true here, UI will flash on every update. 
        // Better to separate initial load vs update.

        try {
            // 1. Fetch Agents
            const { data: agentData } = await supabase
                .from('trinity_agent_registry')
                .select('*')
                .order('reputation_score', { ascending: false });

            // 2. Fetch Recent Tasks
            const { data: taskData } = await supabase
                .from('trinity_tasks')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(20);

            if (taskData) setTasks(taskData as Task[]);

            // 3. Fetch Consulting Logs
            const { data: logData } = await supabase
                .from('trinity_agent_logs')
                .select('*')
                .in('action', ['consulting_audit', 'research_complete'])
                .order('created_at', { ascending: false })
                .limit(10);
            if (logData) setLogs(logData);

            // 4. Fetch Heartbeats
            const { data: heartbeatData } = await supabase
                .from('trinity_heartbeat')
                .select('*')
                .gt('last_seen', new Date(Date.now() - 15 * 60 * 1000).toISOString()); // Last 15m
            if (heartbeatData) setHeartbeats(heartbeatData);

            // 5. Fetch Stats (via API to keep aggregation efficient)
            try {
                const statsResponse = await fetch('/api/stats');
                if (statsResponse.ok) {
                    const statsData = await statsResponse.json();
                    setStats(statsData);
                }
            } catch (err) {
                console.error('Failed to fetch stats:', err);
            }

            // 6. MAP TASKS TO AGENTS
            const activeTasks = (taskData || []).filter((t: any) => t.status === 'in_progress' && t.claimed_by);
            const taskMap = new Map(activeTasks.map((t: any) => [t.claimed_by, t]));

            // Enrich Agent Data
            const enrichedAgents = (agentData || []).map((agent: any) => {
                const currentTask = taskMap.get(agent.agent_name);
                const heartbeat = (heartbeatData || []).find((h: any) => h.agent === agent.agent_name);

                return {
                    ...agent,
                    status: heartbeat ? 'active' : 'offline', // Derived status since column is missing
                    currentTask: currentTask || null,
                    lastHeartbeat: heartbeat ? heartbeat.last_seen : null
                };
            });

            if (enrichedAgents.length > 0) setAgents(enrichedAgents as AgentRegistryRecord[]);

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
        // No need to manually call fetchData(), Realtime will catch it. 
        // But for optimistic UI responsiveness, we can call it.
        fetchData();
    };

    const killRandomAgent = async () => {
        const activeAgents = agents.filter(a => a.status === 'active');
        if (activeAgents.length === 0) {
            console.warn('No active agents to kill');
            return;
        }
        const victim = activeAgents[Math.floor(Math.random() * activeAgents.length)];
        await supabase
            .from('trinity_agent_registry')
            .update({ status: 'offline' })
            .eq('id', victim.id);

        console.log(`💀 Agent Killed: ${victim.agent_name}`);
        createTask(`⚠️ ALERT: Agent ${victim.agent_name} went offline unexpectedly`, 'high');
        // Realtime will catch the update
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
        // Debounce mechanism to prevent event storms from triggering too many refreshes
        let timeoutId: NodeJS.Timeout;
        const debouncedRefresh = () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                console.log('⚡ Realtime Update Detected: Refreshing Data...');
                fetchData();
            }, 500); // 500ms debounce
        };

        const channel = supabase.channel('trinity_realtime_data')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'trinity_agent_registry' }, debouncedRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'trinity_tasks' }, debouncedRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'trinity_agent_logs' }, debouncedRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'trinity_heartbeat' }, debouncedRefresh)
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('✅ Trinity Realtime Connected');
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
}
