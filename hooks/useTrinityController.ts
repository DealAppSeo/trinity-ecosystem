import { getGroupForAgent } from '@/lib/agent/groups';
// ... existing imports ...

// ... inside fetchData ...
// Enrich Agent Data
const enrichedAgents = (agentData || []).map((agent: any) => {
    const currentTask = taskMap.get(agent.agent_name);
    const heartbeat = (heartbeatData || []).find((h: any) => h.agent === agent.agent_name);

    // Determine group if missing
    let groupName = agent.group_name;
    if (!groupName) {
        const group = getGroupForAgent(agent.agent_name);
        if (group) groupName = group.id;
    }

    return {
        ...agent,
        group_name: groupName, // Ensure group_name is populated
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
