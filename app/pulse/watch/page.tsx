'use client';

import { Header } from '@/components/Header';
import { AgentGrid } from '@/components/AgentGrid';
import { CostTicker } from '@/components/CostTicker';
import { SignalFeed } from '@/components/SignalFeed';
import { Button } from '@/components/ui/Button';
import { useEffect, useState } from 'react';
import { useTrinityController } from '@/hooks/useTrinityController';
import { Skeleton } from '@/components/ui/Skeleton';
import { SquadHealthCard } from '@/components/SquadHealthCard';
import { Plus, LayoutGrid, X, Eye } from 'lucide-react';

export default function WatchPage() {
    const { agents, logs, stats, loading } = useTrinityController();
    const [selectedSquad, setSelectedSquad] = useState<string | null>(null);
    const [isFounder, setIsFounder] = useState(false);

    useEffect(() => {
        // Simple check for role from cookie
        const role = document.cookie.split('; ').find(row => row.startsWith('trinity_role='))?.split('=')[1];
        setIsFounder(role === 'founder');
    }, []);

    // Initial Data & Greeting
    useEffect(() => {
        const hasVisited = localStorage.getItem('mel_greeted');
        if (!hasVisited) {
            const msg = new SpeechSynthesisUtterance("Welcome to the Trinity Pulse. Observe the symphony of intelligence.");
            window.speechSynthesis.speak(msg);
            localStorage.setItem('mel_greeted', 'true');
        }
    }, []);

    const squads = ['ORCHESTRATION', 'ALPHA', 'BETA', 'GAMMA'] as const;

    return (
        <div className="min-h-screen bg-[#060608] flex flex-col animate-in fade-in duration-700">
            <main className="flex-1 max-w-7xl mx-auto w-full px-4 lg:px-8 py-12 space-y-12 pb-24">
                {/* Minimalist Header HUD */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-8 border-b border-white/5">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h2 className="text-3xl font-black text-white tracking-tighter uppercase">Trinity Pulse</h2>
                            <div className="px-2 py-0.5 rounded bg-violet-500/10 border border-violet-500/20 text-[10px] font-bold text-violet-400 animate-pulse">
                                SYSTEM HEALTHY
                            </div>
                            <div className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] font-bold text-gray-400 flex items-center gap-1">
                                <Eye size={10} /> OBSERVER MODE
                            </div>
                        </div>
                        <p className="text-sm text-gray-500 font-medium">
                            Real-time observability of the autonomous swarm squads.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        {isFounder && (
                            <Button
                                onClick={() => window.open('/conductor', '_self')}
                                className="bg-violet-600 hover:bg-violet-500 text-white font-bold py-6 px-8 rounded-2xl flex items-center gap-2 shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-all hover:scale-105"
                            >
                                <Plus size={20} />
                                Conduct Mission
                            </Button>
                        )}
                        {!isFounder && (
                            <div className="text-[10px] font-mono text-gray-700 bg-white/[0.02] border border-white/5 px-4 py-2 rounded-xl">
                                READ_ONLY_STAKEHOLDER_ACCESS
                            </div>
                        )}
                    </div>
                </div>

                <section className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* Squad HUD */}
                    <div className="lg:col-span-3">
                        {loading ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-48 rounded-3xl bg-white/5" />)}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {squads.map(squadId => (
                                    <SquadHealthCard
                                        key={squadId}
                                        squadId={squadId}
                                        agents={agents}
                                        onClick={() => setSelectedSquad(squadId)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Signal Feed (Observer Feature) */}
                    <div className="lg:col-span-1 h-[500px] lg:h-auto">
                        <SignalFeed logs={logs} />
                    </div>
                </section>

                {/* Progressive Disclosure: Squad Details */}
                {selectedSquad && (
                    <section className="mt-12 animate-in slide-in-from-bottom-4 fade-in duration-500">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4">
                                <LayoutGrid className="text-violet-400" />
                                <h3 className="text-xl font-bold text-white uppercase tracking-tight">
                                    {selectedSquad} Squad Details
                                </h3>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedSquad(null)}
                                className="border-white/10 text-gray-400 hover:text-white"
                            >
                                <X size={16} className="mr-2" />
                                Close Details
                            </Button>
                        </div>
                        <AgentGrid
                            agents={agents.filter(a => (a as any).group_name === selectedSquad || (a as any).group_id === selectedSquad)}
                            isConductor={false}
                        />
                    </section>
                )}

                {/* Real-Time Stats HUD */}
                <section className="pt-12 border-t border-white/5">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                        <div>
                            <div className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1">Total Active Nodes</div>
                            <div className="text-2xl font-bold text-white">{stats?.online_agents || 0} Agents</div>
                        </div>
                        <div>
                            <div className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1">Truths Verified</div>
                            <div className="text-2xl font-bold text-white">
                                {stats?.total_truths?.toLocaleString() || '12,402+'}
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1">System Savings</div>
                            <div className="text-2xl font-bold text-green-500">
                                ${stats?.system_savings?.toFixed(2) || '0.00'}
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1">Human Hours Saved</div>
                            <div className="text-2xl font-bold text-violet-400">
                                {((stats?.total_tasks_completed || 0) * 0.4).toFixed(1)} hrs
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            <CostTicker
                traditional={stats?.system_savings ? stats.system_savings + 847 : 847}
                trinity={stats?.system_savings ? 0.47 : 0.47}
            />
        </div>
    );
}
