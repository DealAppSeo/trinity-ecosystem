"use client";

// Force dynamic rendering to skip build-time data fetching requirements
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
// Use the safe, shared client that has build-time mocks
import { supabase } from '@/lib/supabase';

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
            .on('postgres_changes', { event: '*', schema: 'public', table: 'trinity_agent_registry' }, (payload: any) => {
                console.log('Real-time update:', payload);
                fetchAgents();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchAgents = async () => {
        try {
            const { data, error } = await supabase
                .from('trinity_agent_registry')
                .select('*')
                .order('agent_name');

            if (data) setAgents(data as any);
        } catch (error) {
            console.error('Error fetching agents:', error);
        } finally {
            setLoading(false);
        }
    };

    const updatePrompt = async (agentName: string, newPrompt: string) => {
        try {
            const { error } = await supabase
                .from('trinity_agent_registry')
                .update({ system_prompt: newPrompt })
                .eq('agent_name', agentName);

            if (error) alert('Update failed: ' + error.message);
        } catch (error) {
            console.error('Update error:', error);
        }
    };

    return (
        <div className="p-6 space-y-6 animate-in fade-in duration-500">
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
                        <Card key={agent.agent_name} className="border-l-4 border-l-blue-500 bg-[#0B0B0F] border-white/10">
                            <div className="space-y-4 p-4">
                                <div className="flex justify-between text-xs text-gray-400 uppercase tracking-widest">
                                    <span>Tier: {agent.current_tier}</span>
                                    <span>{agent.system_prompt ? 'Source: DB' : 'Source: Default'}</span>
                                </div>
                                <textarea
                                    className="w-full h-32 bg-black/30 border border-white/10 rounded p-3 text-sm text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono resize-none custom-scrollbar"
                                    value={agent.system_prompt || ''}
                                    placeholder="// Enter system directive here..."
                                    onChange={(e) => {
                                        // Optimistic UI update could be improved, but direct update for now
                                        const updated = agents.map(a => a.agent_name === agent.agent_name ? { ...a, system_prompt: e.target.value } : a);
                                        setAgents(updated);
                                    }}
                                    onBlur={(e) => updatePrompt(agent.agent_name, e.target.value)}
                                />
                                <div className="text-xs text-gray-500 italic flex justify-between">
                                    <span>{agent.agent_name}</span>
                                    <span>Changes save automatically on blur.</span>
                                </div>
                            </div>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}
