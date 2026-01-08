import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { AgentRegistryRecord, Task } from '@/lib/agent/types';

export function useTrinityController() {
    const [agents, setAgents] = useState<AgentRegistryRecord[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    // const supabase = createClient(); // REMOVED: Using imported singleton

    const fetchData = async () => {
        setLoading(true);

        // Fetch Agents
        const { data: agentData } = await supabase
            .from('trinity_agent_registry')
            .select('*')
            .order('reputation_score', { ascending: false });

        if (agentData) setAgents(agentData as AgentRegistryRecord[]);

        // Fetch Recent Tasks
        const { data: taskData } = await supabase
            .from('trinity_tasks')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);

        if (taskData) setTasks(taskData as Task[]);

        setLoading(false);
    };

    const [logs, setLogs] = useState<any[]>([]); // New: Consulting Logs
    const [heartbeats, setHeartbeats] = useState<any[]>([]); // New: Real-time Heartbeats

    // ... existing ...

    const fetchData = async () => {
        setLoading(true);

        // Fetch Agents
        const { data: agentData } = await supabase
            .from('trinity_agent_registry')
            .select('*')
            .order('reputation_score', { ascending: false });
        if (agentData) setAgents(agentData as AgentRegistryRecord[]);

        // Fetch Recent Tasks
        const { data: taskData } = await supabase
            .from('trinity_tasks')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);
        if (taskData) setTasks(taskData as Task[]);

        // NEW: Fetch Consulting Logs
        const { data: logData } = await supabase
            .from('trinity_agent_logs')
            .select('*')
            .in('action', ['consulting_audit', 'research_complete'])
            .order('created_at', { ascending: false })
            .limit(10);
        if (logData) setLogs(logData);

        // NEW: Fetch Heartbeats
        const { data: heartbeatData } = await supabase
            .from('trinity_heartbeat')
            .select('*')
            .gt('last_seen', new Date(Date.now() - 15 * 60 * 1000).toISOString()); // Last 15m
        if (heartbeatData) setHeartbeats(heartbeatData);

        // 3. MAP TASKS TO AGENTS
        // Create a map of AgentName -> CurrentTask
        const activeTasks = (taskData || []).filter((t: any) => t.status === 'in_progress' && t.claimed_by);
        const taskMap = new Map(activeTasks.map((t: any) => [t.claimed_by, t]));

        // Enrich Agent Data
        const enrichedAgents = (agentData || []).map((agent: any) => {
            const currentTask = taskMap.get(agent.agent_name);
            const heartbeat = (heartbeatData || []).find((h: any) => h.agent === agent.agent_name);

            return {
                ...agent,
                currentTask: currentTask || null,
                lastHeartbeat: heartbeat ? heartbeat.last_seen : null
            };
        });

        if (enrichedAgents.length > 0) setAgents(enrichedAgents as AgentRegistryRecord[]);

        setLoading(false);
    };

    // ... create, kill ...

    return { agents, tasks, logs, heartbeats, loading, createTask, killRandomAgent, triggerChaosEvent, refresh: fetchData };
}
useEffect(() => {
    fetchData();
    // Subscriptions remain (could add logs subscription if crucial)
    // ... existing subs ...

    return () => {
        // ... cleanup ...
    };
}, []);

// ... create, kill ...

return { agents, tasks, logs, heartbeats, loading, createTask, killRandomAgent, triggerChaosEvent, refresh: fetchData };
}

const createTask = async (title: string, priority: string = 'medium') => {
    await supabase.from('trinity_tasks').insert({
        title,
        priority,
        status: 'pending',
        created_at: new Date().toISOString()
    });
    fetchData(); // Optimistic refresh
};

const killRandomAgent = async () => {
    // Find active agents
    const activeAgents = agents.filter(a => a.status === 'active');
    if (activeAgents.length === 0) {
        console.warn('No active agents to kill');
        return;
    }

    // Select victim
    const victim = activeAgents[Math.floor(Math.random() * activeAgents.length)];

    // Execute kill
    await supabase
        .from('trinity_agent_registry')
        .update({ status: 'offline' })
        .eq('id', victim.id);

    console.log(`💀 Agent Killed: ${victim.agent_name}`);
    createTask(`⚠️ ALERT: Agent ${victim.agent_name} went offline unexpectedly`, 'high');
    fetchData();
};

const triggerChaosEvent = async (eventType: string) => {
    const title = `🔥 CHAOS SIMULATION: ${eventType}`;
    await createTask(title, 'critical');

    // Log chaos event to console or separate audit log if needed
    console.warn(`Chaos Event Triggered: ${eventType}`);
};

return { agents, tasks, loading, createTask, killRandomAgent, triggerChaosEvent, refresh: fetchData };
}
