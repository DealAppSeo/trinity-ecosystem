import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { AgentRegistryRecord, Task } from '@/lib/agent/types';

export function useTrinityController() {
    const [agents, setAgents] = useState<AgentRegistryRecord[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    // const supabase = createClient(); // REMOVED: Using imported singleton

    useEffect(() => {
        // 1. Initial Fetch
        fetchData();

        // 2. Real-time Subscription (Agents)
        const agentSub = supabase
            .channel('public:trinity_agent_registry')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'trinity_agent_registry' },
                (payload) => {
                    console.log('Real-time Agent Update:', payload);
                    fetchData(); // Refresh on any change
                }
            )
            .subscribe();

        // 3. Real-time Subscription (Tasks)
        const taskSub = supabase
            .channel('public:trinity_tasks')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'trinity_tasks' },
                (payload) => {
                    console.log('Real-time Task Update:', payload);
                    fetchData();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(agentSub);
            supabase.removeChannel(taskSub);
        };
    }, []);

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
