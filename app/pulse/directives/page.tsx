"use client";

import { createClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card'; // Assuming standardized component

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface AgentRecord {
    id: string;
    agent_name: string;
    system_prompt: string | null;
    current_tier: string;
}

export default function DirectivesPage() {
    const [agents, setAgents] = useState<AgentRecord[]>([]);
    const [loading, setLoading] = useState(true);

    // Intuitive: Real-time sync
    useEffect(() => {
        fetchAgents();

        const channel = supabase
            .channel('public:trinity_agent_registry')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'trinity_agent_registry' }, (payload) => {
                console.log('Real-time update:', payload);
                fetchAgents();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchAgents = async () => {
        const { data, error } = await supabase
            .from('trinity_agent_registry')
            .select('*')
            .order('agent_name');

        if (data) setAgents(data as any);
        setLoading(false);
    };

    const updatePrompt = async (agentName: string, newPrompt: string) => {
        const { error } = await supabase
            .from('trinity_agent_registry')
            .update({ system_prompt: newPrompt })
            .eq('agent_name', agentName);

        if (error) alert('Update failed: ' + error.message);
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-white">🧠 Dynamic Agent Directives</h1>
                <div className="text-xs text-gray-400">
                    <span className="text-green-400">●</span> Real-time Sync Active
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
                {loading ? (
                    <div className="text-gray-400">Loading neural pathways...</div>
                ) : (
                    agents.map((agent) => (
                        <Card key={agent.agent_name} className="border-l-4 border-l-blue-500">
                            <div className="space-y-4">
                                <div className="flex justify-between text-xs text-gray-400 uppercase tracking-widest">
                                    <span>Tier: {agent.current_tier}</span>
                                    <span>{agent.system_prompt ? 'Source: DB' : 'Source: Default'}</span>
                                </div>
                                <textarea
                                    className="w-full h-32 bg-black/30 border border-white/10 rounded p-3 text-sm text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                                    value={agent.system_prompt || ''}
                                    placeholder="// Enter system directive here..."
                                    onChange={(e) => {
                                        // Optimistic UI update could be improved, but direct update for now
                                        const updated = agents.map(a => a.agent_name === agent.agent_name ? { ...a, system_prompt: e.target.value } : a);
                                        setAgents(updated);
                                    }}
                                    onBlur={(e) => updatePrompt(agent.agent_name, e.target.value)}
                                />
                                <div className="text-xs text-gray-500 italic">
                                    Changes save automatically on blur.
                                </div>
                            </div>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}
