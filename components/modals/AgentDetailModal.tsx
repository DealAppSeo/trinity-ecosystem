'use client';

import React from 'react';
import { X, Activity, Cpu, Zap, Database, Shield, Layout, Clock, Award, BarChart3, CheckCircle } from 'lucide-react';
import { AgentRegistryRecord } from '@/lib/agent/types';
import { cn } from '@/lib/utils';
import { StatusDot } from '../ui/StatusDot';
import { RepIdBadge } from '../ui/RepIdBadge';
import { AGENT_WISDOM } from '@/lib/agent/wisdom';
import { getGroupForAgent } from '@/lib/agent/groups';

interface AgentDetailModalProps {
    agent: AgentRegistryRecord & { logs?: any[] };
    isOpen: boolean;
    onClose: () => void;
}

export function AgentDetailModal({ agent, isOpen, onClose }: AgentDetailModalProps) {
    if (!isOpen) return null;

    const getAgentIcon = (group: string) => {
        switch (group?.toUpperCase()) {
            case 'ORCHESTRATION': return <Cpu className="w-6 h-6" />;
            case 'CODE': return <Layout className="w-6 h-6" />;
            case 'INFRA': return <Database className="w-6 h-6" />;
            case 'TRUST': return <Shield className="w-6 h-6" />;
            case 'ALPHA': return <Shield className="w-6 h-6 text-blue-400" />;
            case 'BETA': return <Layout className="w-6 h-6 text-emerald-400" />;
            case 'GAMMA': return <Database className="w-6 h-6 text-amber-400" />;
            default: return <Activity className="w-6 h-6" />;
        }
    };

    const wisdom = AGENT_WISDOM[agent.agent_name];
    const group = getGroupForAgent(agent.agent_name);

    const stats = [
        { label: 'Reputation', value: agent.reputation_score?.toFixed(1) || '0.0', icon: Award, color: 'text-yellow-400' },
        { label: 'Tasks Done', value: agent.tasks_completed || 0, icon: CheckCircle, color: 'text-green-400' },
        { label: 'Uptime', value: agent.uptime || 'N/A', icon: Clock, color: 'text-cyan-400' },
        { label: 'Efficiency', value: '98%', icon: BarChart3, color: 'text-violet-400' },
    ];

    return (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-black/95 backdrop-blur-2xl" onClick={onClose} />

            <div className="relative glass rounded-[2.5rem] w-full max-w-3xl border border-white/10 shadow-[0_0_80px_-15px_rgba(139,92,246,0.4)] overflow-hidden flex flex-col max-h-[90vh]">
                {/* Visual Header */}
                <div className="h-48 relative overflow-hidden shrink-0 border-b border-white/10">
                    <div className="absolute inset-0 bg-gradient-to-br from-violet-900/40 via-blue-900/20 to-transparent z-0" />
                    <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #8b5cf6 1px, transparent 1px)', backgroundSize: '16px 16px' }} />

                    <div className="absolute bottom-6 left-8 z-10 flex items-end gap-6">
                        <div className="relative">
                            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-violet-600 to-indigo-700 p-[2px] shadow-2xl">
                                <div className="w-full h-full rounded-[1.4rem] bg-[#0B0B0F] flex items-center justify-center text-white">
                                    {getAgentIcon(agent.group_name || group?.id || 'ALPHA')}
                                </div>
                            </div>
                            <div className="absolute -bottom-1 -right-1 ring-4 ring-[#0B0B0F] rounded-full overflow-hidden">
                                <StatusDot status={agent.status} />
                            </div>
                        </div>
                        <div className="mb-2">
                            <div className="flex items-center gap-3 mb-1">
                                <h3 className="text-3xl font-black text-white tracking-tight uppercase">{agent.agent_name.replace('trinity-', '')}</h3>
                                <RepIdBadge score={agent.reputation_score} />
                            </div>
                            <p className="text-violet-400 font-mono text-xs font-bold tracking-[0.3em] uppercase opacity-70">
                                {agent.group_name || group?.name} // NODE v2.4
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="absolute top-6 right-6 p-3 rounded-2xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all border border-white/10 z-20"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
                    {/* Operational HUD */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {stats.map((stat, i) => (
                            <div key={i} className="p-4 rounded-3xl bg-white/[0.03] border border-white/5 flex flex-col items-center text-center">
                                <stat.icon className={cn("w-5 h-5 mb-2", stat.color)} />
                                <div className="text-xl font-black text-white">{stat.value}</div>
                                <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">{stat.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Current Activity Section */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                <Zap className="w-3 h-3 text-yellow-400" /> Live Priority Feed
                            </h4>
                            <span className="text-[10px] text-green-400 font-mono bg-green-400/10 px-2 py-0.5 rounded-full border border-green-400/20">AGENT_SYNCED</span>
                        </div>
                        <div className="p-6 rounded-[2rem] bg-gradient-to-br from-white/[0.03] to-white/[0.01] border border-white/10 glow-violet-sm">
                            <div className="flex items-start gap-4">
                                <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse mt-1.5 shrink-0" />
                                <div>
                                    <h5 className="font-bold text-lg text-white mb-2">{agent.current_task_summary || (agent as any).currentTask?.title || "Observing Environment"}</h5>
                                    <p className="text-sm text-zinc-400 leading-relaxed mb-4">
                                        {agent.currentTask?.description || "Agent is currently processing telemetry and awaiting decentralized mission assignments."}
                                    </p>
                                    <div className="flex gap-2">
                                        <span className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-[9px] font-mono text-zinc-500">
                                            TASK_ID: {agent.currentTask?.id ? String(agent.currentTask.id).slice(0, 8) : 'N/A'}
                                        </span>
                                        <span className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-[9px] font-mono text-zinc-500">MEMORY_LOAD: 2.4 GB</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Meta Capability Matrix */}
                    <div className="space-y-4">
                        <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                            <Cpu className="w-3 h-3 text-cyan-400" /> Identity Matrix
                        </h4>
                        <div className="p-6 rounded-[2rem] bg-white/[0.02] border border-white/5 space-y-4">
                            <div className="flex justify-between items-start gap-4">
                                <span className="text-xs text-zinc-400 shrink-0 mt-1">Core Identity:</span>
                                <div className="text-right">
                                    <div className="text-xs text-white font-bold">{wisdom?.role?.toUpperCase() || agent.identity || "Autonomous Swarm Intelligent"}</div>
                                    <p className="text-[10px] text-zinc-500 mt-1 max-w-xs">{agent.mission || "System Integrity & Optimization"}</p>
                                </div>
                            </div>

                            <div className="h-px bg-white/5 w-full" />

                            <div className="flex justify-between items-start gap-4">
                                <span className="text-xs text-zinc-400 shrink-0">Squad Focus:</span>
                                <div className="text-right">
                                    <span className="text-[10px] text-violet-400 font-bold uppercase tracking-wider bg-violet-400/10 px-2 py-0.5 rounded border border-violet-400/20">{agent.group_name || group?.id}</span>
                                    <p className="text-[10px] text-zinc-500 mt-1 max-w-xs">{group?.description || "Specialized functional unit within the Trinity Ecosystem."}</p>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2 pt-2">
                                <span className="text-[9px] text-zinc-500 uppercase font-bold tracking-tighter">Specialties:</span>
                                {(wisdom?.specialties || ['Autonomous Operations', 'Truth Verification', 'System Resilience']).map((spec, i) => (
                                    <span key={i} className="text-[9px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-zinc-400 font-medium">
                                        {spec}
                                    </span>
                                ))}
                            </div>

                            <div className="h-px bg-white/5 w-full" />

                            <div className="flex justify-between items-center">
                                <span className="text-xs text-zinc-400">Last Telemetry:</span>
                                <span className="text-xs text-zinc-500 font-mono">{new Date(agent.last_active || 0).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sticky Footer */}
                <div className="p-6 bg-violet-600/5 border-t border-white/10 flex justify-between items-center shrink-0">
                    <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-widest">
                        Trinity Symphony Agent Explorer // SEC_AUTH_LVL_4
                    </p>
                    <div className="flex gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e]" />
                        <div className="w-2 h-2 rounded-full bg-white/10" />
                        <div className="w-2 h-2 rounded-full bg-white/10" />
                    </div>
                </div>
            </div>
        </div>
    );
}
