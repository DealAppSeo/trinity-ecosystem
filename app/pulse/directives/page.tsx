"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { supabase } from '@/lib/supabase';
import { Cpu, Zap, Heart, Shield, Save, RefreshCw, Users, Layers, Wand2 } from 'lucide-react';
import { AGENT_GROUPS, AGENT_GROUPS as GROUP_DATA } from '@/lib/agent/groups';
import { toast } from 'sonner';

interface AgentRecord {
    id: string;
    agent_name: string;
    system_prompt: string | null;
    current_tier: string;
}

export default function ArchitectPage() {
    const [agents, setAgents] = useState<AgentRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);

    // Slot States
    const [slots, setSlots] = useState([
        { id: 1, targetType: 'agent' as 'agent' | 'squad', targetId: '', prompt: '' },
        { id: 2, targetType: 'agent' as 'agent' | 'squad', targetId: '', prompt: '' },
        { id: 3, targetType: 'agent' as 'agent' | 'squad', targetId: '', prompt: '' },
    ]);

    useEffect(() => {
        fetchAgents();
    }, []);

    const fetchAgents = async () => {
        try {
            const { data } = await supabase.from('trinity_agent_registry').select('*').order('agent_name');
            if (data) setAgents(data as any);
        } catch (error) {
            console.error('Error fetching agents:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateDirective = async (slotIndex: number) => {
        const slot = slots[slotIndex];
        if (!slot.targetId) {
            toast.error("Please select a target first");
            return;
        }

        setSaving(`slot-${slotIndex}`);
        try {
            let targetAgents: string[] = [];
            if (slot.targetType === 'squad') {
                targetAgents = (GROUP_DATA as any)[slot.targetId]?.members || [];
            } else {
                targetAgents = [slot.targetId];
            }

            const { error } = await supabase
                .from('trinity_agent_registry')
                .update({ system_prompt: slot.prompt })
                .in('agent_name', targetAgents);

            if (error) throw error;
            toast.success(`Broadcasting directive to ${targetAgents.length} agents...`);
            fetchAgents();
        } catch (error: any) {
            toast.error("Injection failed: " + error.message);
        } finally {
            setSaving(null);
        }
    };

    const updateSlot = (index: number, updates: any) => {
        const newSlots = [...slots];
        newSlots[index] = { ...newSlots[index], ...updates };

        // If targetId changes and it's an agent, auto-fill current prompt
        if (updates.targetId && newSlots[index].targetType === 'agent') {
            const agent = agents.find(a => a.agent_name === updates.targetId);
            if (agent) newSlots[index].prompt = agent.system_prompt || '';
        }

        setSlots(newSlots);
    };

    const getTargetLabel = (slot: any) => {
        if (!slot.targetId) return "Select Target";
        if (slot.targetType === 'squad') return `Squad: ${slot.targetId}`;
        return slot.targetId;
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/5 pb-6">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <Wand2 className="w-8 h-8 text-violet-400" />
                        Architect Command Center
                    </h1>
                    <p className="text-gray-400 mt-2">
                        Inject primary directives into the swarm's collective intelligence.
                    </p>
                </div>
                <div className="flex items-center gap-4 bg-black/40 px-4 py-2 rounded-full border border-white/5">
                    <span className="text-[10px] font-mono text-violet-400 tracking-tighter">BFT CONSENSUS ACTIVE</span>
                    <RefreshCw className={`w-4 h-4 text-violet-400 ${loading ? 'animate-spin' : ''}`} />
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {slots.map((slot, idx) => (
                    <Card key={slot.id} className="bg-[#0B0B0F]/80 border-white/10 backdrop-blur-xl relative overflow-hidden group flex flex-col h-[600px]">
                        {/* Slot Header */}
                        <div className="p-6 border-b border-white/5 bg-gradient-to-br from-white/[0.02] to-transparent">
                            <div className="flex justify-between items-center mb-6">
                                <span className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em]">DIRECTIVE_SLOT_0{slot.id}</span>
                                <div className="flex gap-1">
                                    <div className="w-1 h-1 rounded-full bg-violet-500 shadow-[0_0_5px_rgba(139,92,246,0.5)]" />
                                    <div className="w-1 h-1 rounded-full bg-violet-500/30" />
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => updateSlot(idx, { targetType: 'agent', targetId: '' })}
                                        className={`flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all ${slot.targetType === 'agent' ? 'bg-violet-600 text-white' : 'bg-white/5 text-gray-500'}`}
                                    >
                                        SINGLE AGENT
                                    </button>
                                    <button
                                        onClick={() => updateSlot(idx, { targetType: 'squad', targetId: '' })}
                                        className={`flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all ${slot.targetType === 'squad' ? 'bg-violet-600 text-white' : 'bg-white/5 text-gray-500'}`}
                                    >
                                        SQUAD BROADCAST
                                    </button>
                                </div>

                                <select
                                    value={slot.targetId}
                                    onChange={(e) => updateSlot(idx, { targetId: e.target.value })}
                                    className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-sm text-gray-200 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all font-mono"
                                >
                                    <option value="">-- Choose {slot.targetType === 'agent' ? 'Agent' : 'Squad'} --</option>
                                    {slot.targetType === 'agent' ? (
                                        agents.map(a => <option key={a.agent_name} value={a.agent_name}>{a.agent_name}</option>)
                                    ) : (
                                        Object.keys(AGENT_GROUPS).map(g => <option key={g} value={g}>{g} SQUAD</option>)
                                    )}
                                </select>
                            </div>
                        </div>

                        {/* Prompt Area */}
                        <div className="flex-1 p-6 relative flex flex-col">
                            <div className="flex items-center gap-2 mb-3">
                                <Layers className="w-4 h-4 text-violet-400" />
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Neural Directives</span>
                            </div>
                            <textarea
                                value={slot.prompt}
                                onChange={(e) => updateSlot(idx, { prompt: e.target.value })}
                                className="flex-1 w-full bg-black/20 border border-white/5 rounded-xl p-4 text-sm text-gray-300 font-mono resize-none focus:outline-none focus:border-violet-500/30 transition-all custom-scrollbar placeholder:text-gray-700"
                                placeholder={`// Enter directives for ${getTargetLabel(slot)}...`}
                            />

                            <div className="mt-6">
                                <button
                                    onClick={() => handleUpdateDirective(idx)}
                                    disabled={saving === `slot-${idx}` || !slot.targetId}
                                    className="w-full py-4 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-violet-900/20 active:scale-[0.98]"
                                >
                                    {saving === `slot-${idx}` ? (
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <>
                                            <Save className="w-4 h-4" />
                                            INJECT DIRECTIVE
                                        </>
                                    )}
                                </button>
                                <p className="text-[9px] text-gray-600 text-center mt-3 font-mono">
                                    REPID AUTHORIZATION REQUIRED • O(LOG N) CONVERGENCE
                                </p>
                            </div>
                        </div>

                        {/* Background Decoration */}
                        <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none pr-0 pt-0">
                            {slot.id === 1 ? <Zap size={180} /> : slot.id === 2 ? <Heart size={180} /> : <Shield size={180} />}
                        </div>
                    </Card>
                ))}
            </div>

            {/* Bottom Status Info */}
            <footer className="glass rounded-2xl p-6 border border-white/5 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-6">
                    <div className="flex flex-col">
                        <span className="text-[10px] text-gray-500 uppercase font-mono mb-1">Total Intelligence</span>
                        <span className="text-xl font-bold text-white">{agents.length} Nodes</span>
                    </div>
                    <div className="w-px h-10 bg-white/5 hidden md:block" />
                    <div className="flex flex-col">
                        <span className="text-[10px] text-gray-500 uppercase font-mono mb-1">Registry Sync</span>
                        <span className="text-xl font-bold text-green-400">Stable</span>
                    </div>
                </div>
                <div className="text-xs text-gray-500 text-center md:text-right font-mono italic">
                    Directives are evaluated against the Collective Ethics Core (AITC-Constitutional-V4)
                </div>
            </footer>
        </div>
    );
}
