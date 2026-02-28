'use client';

import { Header } from '@/components/Header';
import { AgentGrid } from '@/components/AgentGrid';
import { CostTicker } from '@/components/CostTicker';
import { Button } from '@/components/ui/Button';
import { useEffect, useState } from 'react';
import { useTrinityController } from '@/hooks/useTrinityController';
import { Skeleton } from '@/components/ui/Skeleton';
import { SquadHealthCard } from '@/components/SquadHealthCard';
import { Plus, LayoutGrid, X } from 'lucide-react';

export default function WatchPage() {
    const { agents, loading } = useTrinityController();
    const [selectedSquad, setSelectedSquad] = useState<string | null>(null);

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
                            <div className="px-2 py-0.5 rounded bg-green-500/10 border border-green-500/20 text-[10px] font-bold text-green-400 animate-pulse">
                                SYSTEM HEALTHY
                            </div>
                        </div>
                        <p className="text-sm text-gray-500 font-medium">
                            Real-time observability of the autonomous swarm squads.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button
                            onClick={() => window.open('/conductor', '_self')}
                            className="bg-violet-600 hover:bg-violet-500 text-white font-bold py-6 px-8 rounded-2xl flex items-center gap-2 shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-all hover:scale-105"
                        >
                            <Plus size={20} />
                            Conduct Mission
                        </Button>
                    </div>
                </div>

                {/* Squad HUD */}
                <section>
                    {loading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-64 rounded-3xl bg-white/5" />)}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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

                {/* High-Level Stats Placeholder (Simplified from Signal Feed) */}
                <section className="pt-12 border-t border-white/5">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                        <div>
                            <div className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1">Total Active Agents</div>
                            <div className="text-2xl font-bold text-white">{agents.length} Nodes</div>
                        </div>
                        <div>
                            <div className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1">Swarm Uptime</div>
                            <div className="text-2xl font-bold text-white">99.98%</div>
                        </div>
                        <div>
                            <div className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1">Consensus Type</div>
                            <div className="text-2xl font-bold text-white">BFT-DASH</div>
                        </div>
                        <div>
                            <div className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1">Global Reputation</div>
                            <div className="text-2xl font-bold text-white">8.4 / 10</div>
                        </div>
                    </div>
                </section>
            </main>

            <CostTicker traditional={847.00} trinity={0.47} />
        </div>
    );
}
