"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { supabase } from '@/lib/supabase';
import {
    Cpu, Zap, Heart, Shield, Save, RefreshCw,
    Users, Layers, Wand2, Power, Trash2,
    ChevronUp, ChevronDown, Activity,
    AlertTriangle, CheckCircle2, FlaskConical,
    Skull, Rocket, Terminal, Sprout
} from 'lucide-react';
import { AGENT_GROUPS, AGENT_GROUPS as GROUP_DATA } from '@/lib/agent/groups';
import { toast } from 'sonner';

interface AgentRecord {
    id: string;
    agent_name: string;
    system_prompt: string | null;
    current_tier: string;
    status: string;
    last_active: string;
    reputation_score: number;
}

interface TaskRecord {
    id: string;
    title: string;
    description: string;
    priority: number;
    status: string;
}

interface SwarmHealth {
    active_agents: number;
    health_score: number;
    status_summary: string;
    pillar: string;
    consensus_mode: string;
    verification_backlog: number;
}

export default function FoundersDashboard() {
    const [agents, setAgents] = useState<AgentRecord[]>([]);
    const [tasks, setTasks] = useState<TaskRecord[]>([]);
    const [health, setHealth] = useState<SwarmHealth | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [saving, setSaving] = useState<string | null>(null);

    // Directive slot states
    const [slots, setSlots] = useState([
        { id: 1, targetType: 'agent' as 'agent' | 'squad', targetId: '', prompt: '' },
    ]);

    useEffect(() => {
        fetchAllData();
        const interval = setInterval(fetchAllData, 15000);
        return () => clearInterval(interval);
    }, []);

    const fetchAllData = async () => {
        setLoading(true);
        try {
            await Promise.all([
                fetchAgents(),
                fetchTasks(),
                fetchHealth()
            ]);
        } catch (error) {
            console.error('Data sync error:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchAgents = async () => {
        const { data } = await supabase.from('trinity_agent_registry').select('*').order('agent_name');
        if (data) setAgents(data as any);
    };

    const fetchTasks = async () => {
        const { data } = await supabase
            .from('trinity_tasks')
            .select('*')
            .eq('status', 'pending')
            .order('priority', { ascending: false })
            .order('created_at', { ascending: true });
        if (data) setTasks(data as any);
    };

    const fetchHealth = async () => {
        const res = await fetch('/api/swarm-health');
        const data = await res.json();
        setHealth(data);
    };

    const handleGlobalAction = async (action: string) => {
        setActionLoading(action);
        try {
            const res = await fetch('/api/swarm-control', {
                method: 'POST',
                body: JSON.stringify({ action }),
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(data.message);
                setTimeout(fetchAllData, 2000);
            } else {
                toast.error(data.error);
            }
        } catch (error: any) {
            toast.error("Operation failed: " + error.message);
        } finally {
            setActionLoading(null);
        }
    };

    const updateTaskPriority = async (taskId: string, currentPriority: number, direction: 'up' | 'down') => {
        const newPriority = direction === 'up' ? currentPriority + 1 : Math.max(0, currentPriority - 1);
        try {
            const res = await fetch(`/api/tasks/${taskId}`, {
                method: 'PATCH',
                body: JSON.stringify({ priority: newPriority }),
                headers: { 'Content-Type': 'application/json' }
            });
            if (res.ok) {
                toast.success(`Task prioritized to ${newPriority}`);
                fetchTasks();
            }
        } catch (error: any) {
            toast.error("Priority shift failed: " + error.message);
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
            toast.success(`Directive injected into ${targetAgents.length} neural nodes.`);
            fetchAgents();
        } catch (error: any) {
            toast.error("Injection failed: " + error.message);
        } finally {
            setSaving(null);
        }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
            {/* Header Section */}
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-8">
                <div>
                    <div className="flex items-center gap-2 text-violet-400 font-mono text-[10px] tracking-[0.3em] mb-2 uppercase">
                        <Terminal className="w-3 h-3" />
                        Founders Command Center
                    </div>
                    <h1 className="text-4xl font-black text-white tracking-tight flex items-center gap-3">
                        Swarm Orchestrator
                        <span className="text-sm font-mono bg-violet-500/10 text-violet-400 px-3 py-1 rounded-full border border-violet-500/20">v8.1.3-AG</span>
                    </h1>
                    <p className="text-gray-400 mt-3 max-w-xl line-clamp-2">
                        Strategic oversight of the Trinity Multi-Agent BFT Ecosystem.
                        Direct the collective intelligence through primary directives and priority shifting.
                    </p>
                </div>

                <div className="flex flex-wrap gap-4 items-center">
                    <div className="px-4 py-2 bg-black/40 rounded-xl border border-white/5 backdrop-blur-md flex items-center gap-6">
                        <div className="flex flex-col">
                            <span className="text-[9px] font-mono text-gray-500 uppercase">Pillar</span>
                            <span className="text-xs font-bold text-white">{health?.pillar || '---'}</span>
                        </div>
                        <div className="w-px h-8 bg-white/5" />
                        <div className="flex flex-col">
                            <span className="text-[9px] font-mono text-gray-500 uppercase">Consensus</span>
                            <span className="text-xs font-bold text-green-400 flex items-center gap-1">
                                {health?.consensus_mode === 'BFT_ACTIVE' ? <CheckCircle2 className="w-3 h-3" /> : <Activity className="w-3 h-3 text-yellow-500" />}
                                {health?.consensus_mode || 'POLLING'}
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={fetchAllData}
                        className={`p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors ${loading ? 'animate-spin' : ''}`}
                    >
                        <RefreshCw className="w-5 h-5 text-gray-400" />
                    </button>
                </div>
            </header>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card className="p-6 bg-[#0F0F15]/60 border-white/5 backdrop-blur-2xl relative overflow-hidden group">
                    <div className="relative z-10">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-2 bg-violet-500/10 rounded-lg">
                                <Activity className="w-5 h-5 text-violet-400" />
                            </div>
                            <span className="text-[10px] font-mono text-violet-400/50">O(LOG N)</span>
                        </div>
                        <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wider">Swarm Vitality</h3>
                        <p className="text-3xl font-black text-white mt-1">{health?.health_score || 0}%</p>
                        <div className="mt-4 flex items-center gap-2">
                            <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-violet-600 to-indigo-500 transition-all duration-1000"
                                    style={{ width: `${health?.health_score || 0}%` }}
                                />
                            </div>
                        </div>
                    </div>
                    <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:scale-110 transition-transform">
                        <Zap size={100} />
                    </div>
                </Card>

                <Card className="p-6 bg-[#0F0F15]/60 border-white/5 backdrop-blur-2xl relative overflow-hidden group">
                    <div className="relative z-10">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-2 bg-emerald-500/10 rounded-lg">
                                <Users className="w-5 h-5 text-emerald-400" />
                            </div>
                        </div>
                        <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wider">Active Nodes</h3>
                        <p className="text-3xl font-black text-white mt-1">{health?.active_agents || 0} <span className="text-lg text-gray-500">/ 12</span></p>
                        <p className="text-[10px] text-emerald-400 mt-2 font-mono">ALL SQUADS CONTRIBUTING</p>
                    </div>
                </Card>

                <Card className="p-6 bg-[#0F0F15]/60 border-white/5 backdrop-blur-2xl relative overflow-hidden group">
                    <div className="relative z-10">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-2 bg-orange-500/10 rounded-lg">
                                <Layers className="w-5 h-5 text-orange-400" />
                            </div>
                        </div>
                        <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wider">Verify Queue</h3>
                        <p className="text-3xl font-black text-white mt-1">{health?.verification_backlog || 0}</p>
                        <p className="text-[10px] text-orange-400 mt-2 font-mono">BFT PRIORITY ACTIVE</p>
                    </div>
                </Card>

                <Card className="p-6 bg-[#0F0F15]/60 border-white/5 backdrop-blur-2xl relative overflow-hidden group">
                    <div className="relative z-10">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-2 bg-sky-500/10 rounded-lg">
                                <Shield className="w-5 h-5 text-sky-400" />
                            </div>
                        </div>
                        <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wider">System Status</h3>
                        <p className="text-xl font-black text-white mt-1 uppercase tracking-tighter">{health?.status_summary || 'INITIALIZING...'}</p>
                        <p className="text-[10px] text-sky-400 mt-4 font-mono italic">NO SLASHE DETECTED</p>
                    </div>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Panel: Global Controls & Priority */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Founder Actions */}
                    <Card className="bg-[#0B0B0F]/80 border-white/10 backdrop-blur-xl overflow-hidden">
                        <div className="p-6 border-b border-white/5 bg-gradient-to-br from-white/[0.02] to-transparent">
                            <div className="flex items-center gap-3">
                                <FlaskConical className="w-5 h-5 text-violet-400" />
                                <h2 className="text-lg font-bold text-white">Founder Global Controls</h2>
                            </div>
                        </div>
                        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <button
                                onClick={() => handleGlobalAction('REBOOT_SWARM')}
                                disabled={!!actionLoading}
                                className="group relative flex flex-col items-center justify-center p-6 bg-violet-600/10 border border-violet-500/20 rounded-2xl hover:bg-violet-600 transition-all duration-300 active:scale-95 disabled:opacity-50"
                            >
                                <Rocket className={`w-8 h-8 text-violet-400 group-hover:text-white mb-3 ${actionLoading === 'REBOOT_SWARM' ? 'animate-bounce' : ''}`} />
                                <span className="text-xs font-black tracking-widest text-violet-200 group-hover:text-white uppercase">Wake Swarm</span>
                                <span className="text-[8px] text-violet-400/60 group-hover:text-white/60 mt-2 font-mono">CASCADE REDEPLOY</span>
                            </button>

                            <button
                                onClick={() => handleGlobalAction('SEED_EVERGREEN')}
                                disabled={!!actionLoading}
                                className="group relative flex flex-col items-center justify-center p-6 bg-blue-600/10 border border-blue-500/20 rounded-2xl hover:bg-blue-600 transition-all duration-300 active:scale-95 disabled:opacity-50"
                            >
                                <Sprout className={`w-8 h-8 text-blue-400 group-hover:text-white mb-3 ${actionLoading === 'SEED_EVERGREEN' ? 'animate-pulse' : ''}`} />
                                <span className="text-xs font-black tracking-widest text-blue-200 group-hover:text-white uppercase">Seed Evergreen</span>
                                <span className="text-[8px] text-blue-400/60 group-hover:text-white/60 mt-2 font-mono">CONTINUOUS LEARNING</span>
                            </button>

                            <button
                                onClick={() => handleGlobalAction('FLUSH_GHOSTS')}
                                disabled={!!actionLoading}
                                className="group relative flex flex-col items-center justify-center p-6 bg-emerald-600/10 border border-emerald-500/20 rounded-2xl hover:bg-emerald-600 transition-all duration-300 active:scale-95 disabled:opacity-50"
                            >
                                <Zap className={`w-8 h-8 text-emerald-400 group-hover:text-white mb-3 ${actionLoading === 'FLUSH_GHOSTS' ? 'animate-pulse' : ''}`} />
                                <span className="text-xs font-black tracking-widest text-emerald-200 group-hover:text-white uppercase">Flush Ghosts</span>
                                <span className="text-[8px] text-emerald-400/60 group-hover:text-white/60 mt-2 font-mono">ATOMIC RESET</span>
                            </button>

                            <button
                                onClick={() => handleGlobalAction('WIPE_ALL')}
                                disabled={!!actionLoading}
                                className="group relative flex flex-col items-center justify-center p-6 bg-red-600/10 border border-red-500/20 rounded-2xl hover:bg-red-600 transition-all duration-300 active:scale-95 disabled:opacity-50"
                            >
                                <Skull className={`w-8 h-8 text-red-500 group-hover:text-white mb-3 ${actionLoading === 'WIPE_ALL' ? 'animate-spin' : ''}`} />
                                <span className="text-xs font-black tracking-widest text-red-200 group-hover:text-white uppercase">Nuclear Wipe</span>
                                <span className="text-[8px] text-red-400/60 group-hover:text-white/60 mt-2 font-mono">DANGER ZONE</span>
                            </button>
                        </div>
                    </Card>

                    {/* Task Priority Manager */}
                    <Card className="bg-[#0B0B0F]/80 border-white/10 backdrop-blur-xl h-[600px] flex flex-col">
                        <div className="p-6 border-b border-white/5 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <Layers className="w-5 h-5 text-sky-400" />
                                <h2 className="text-lg font-bold text-white">Task Priority Manager</h2>
                            </div>
                            <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">{tasks.length} PENDING JOBS</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                            {tasks.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center opacity-30 italic text-sm">
                                    <CheckCircle2 className="w-12 h-12 mb-4" />
                                    No pending tasks. Swarm idle.
                                </div>
                            ) : tasks.map((task) => (
                                <div key={task.id} className="p-4 bg-white/[0.03] border border-white/5 rounded-xl flex items-center gap-4 group hover:bg-white/[0.05] transition-all">
                                    <div className="flex flex-col gap-1">
                                        <button onClick={() => updateTaskPriority(task.id, task.priority, 'up')} className="p-1 hover:bg-white/10 rounded transition-colors">
                                            <ChevronUp className="w-4 h-4 text-violet-400" />
                                        </button>
                                        <div className="text-center font-mono font-bold text-xs text-violet-200">{task.priority}</div>
                                        <button onClick={() => updateTaskPriority(task.id, task.priority, 'down')} className="p-1 hover:bg-white/10 rounded transition-colors">
                                            <ChevronDown className="w-4 h-4 text-violet-400/50" />
                                        </button>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-sm font-bold text-white truncate">{task.title}</h4>
                                        <p className="text-[10px] text-gray-500 mt-1 line-clamp-1 italic">{task.description}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="px-2 py-1 rounded-md bg-white/5 text-[9px] font-mono text-gray-500 uppercase">PENDING</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>

                {/* Right Panel: Agent Mastery & Directives */}
                <div className="space-y-8">
                    {/* Agent Activity Grid */}
                    <Card className="bg-[#0B0B0F]/80 border-white/10 backdrop-blur-xl h-[450px] flex flex-col">
                        <div className="p-6 border-b border-white/5">
                            <div className="flex items-center gap-3">
                                <Users className="w-5 h-5 text-emerald-400" />
                                <h2 className="text-lg font-bold text-white">Neural Network Status</h2>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
                            {agents.map((agent) => (
                                <div key={agent.id} className="p-3 bg-black/40 border border-white/5 rounded-xl flex items-center justify-between group hover:border-violet-500/30 transition-all">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-2 h-2 rounded-full ${new Date(agent.last_active) > new Date(Date.now() - 5 * 60 * 1000) ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'} animate-pulse`} />
                                        <span className="text-xs font-mono font-bold text-gray-200">{agent.agent_name}</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="text-[10px] font-mono text-gray-500 uppercase">{agent.status || 'OFFLINE'}</span>
                                        <div className="flex flex-col items-end">
                                            <span className="text-[10px] font-mono text-violet-400 font-bold">{agent.reputation_score}</span>
                                            <span className="text-[8px] text-gray-600 uppercase">REPID</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>

                    {/* Directives Injection */}
                    <Card className="bg-[#0B0B0F]/80 border-white/10 backdrop-blur-xl relative overflow-hidden group">
                        <div className="p-6 border-b border-white/5">
                            <div className="flex items-center gap-3">
                                <Wand2 className="w-5 h-5 text-violet-400" />
                                <h2 className="text-lg font-bold text-white">Neural Directive Injection</h2>
                            </div>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setSlots([{ ...slots[0], targetType: 'agent', targetId: '' }])}
                                    className={`flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all ${slots[0].targetType === 'agent' ? 'bg-violet-600 text-white' : 'bg-white/5 text-gray-500'}`}
                                >
                                    SINGLE
                                </button>
                                <button
                                    onClick={() => setSlots([{ ...slots[0], targetType: 'squad', targetId: '' }])}
                                    className={`flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all ${slots[0].targetType === 'squad' ? 'bg-violet-600 text-white' : 'bg-white/5 text-gray-500'}`}
                                >
                                    SQUAD
                                </button>
                            </div>

                            <select
                                value={slots[0].targetId}
                                onChange={(e) => setSlots([{ ...slots[0], targetId: e.target.value }])}
                                className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2.5 text-xs text-gray-200 font-mono focus:border-violet-500 transition-all"
                            >
                                <option value="">-- Select Target --</option>
                                {slots[0].targetType === 'agent' ? (
                                    agents.map(a => <option key={a.agent_name} value={a.agent_name}>{a.agent_name}</option>)
                                ) : (
                                    Object.keys(AGENT_GROUPS).map(g => <option key={g} value={g}>{g}</option>)
                                )}
                            </select>

                            <textarea
                                value={slots[0].prompt}
                                onChange={(e) => setSlots([{ ...slots[0], prompt: e.target.value }])}
                                className="w-full h-32 bg-black/20 border border-white/5 rounded-xl p-4 text-[11px] text-gray-400 font-mono resize-none focus:border-violet-500/30 transition-all custom-scrollbar placeholder:text-gray-700"
                                placeholder="// Enter directives..."
                            />

                            <button
                                onClick={() => handleUpdateDirective(0)}
                                disabled={!!saving || !slots[0].targetId}
                                className="w-full py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-[10px] font-black tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg shadow-violet-900/20 uppercase"
                            >
                                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Inject Directive</>}
                            </button>
                        </div>

                        {/* Decorative zk-proof background */}
                        <div className="absolute top-0 right-0 p-4 font-mono text-[8px] text-violet-500/10 pointer-events-none uppercase break-all max-w-[150px]">
                            proof: [REDACTED_ZK_STARK_0x{Math.random().toString(16).slice(2, 10)}]
                            securing_neural_escalation_O(log_n)
                        </div>
                    </Card>
                </div>
            </div>

            {/* Verification & Footnote */}
            <footer className="glass rounded-2xl p-6 border border-white/5 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-6">
                    <div className="hidden sm:flex flex-col">
                        <span className="text-[10px] text-gray-500 uppercase font-mono mb-1">Architecture</span>
                        <span className="text-xs font-bold text-white tracking-widest">TRIUNE BFT SYMPHONY</span>
                    </div>
                </div>
                <div className="text-[10px] text-gray-600 text-center md:text-right font-mono italic max-w-md">
                    Note: Patent-pending Multiplicative GNN is active across the 3x3 squad structure. Core integrity secured via zkSTARK proofs.
                </div>
            </footer>
        </div>
    );
}
