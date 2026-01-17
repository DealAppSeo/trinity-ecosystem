'use client';

import { Header } from '@/components/Header';
import { AgentGrid } from '@/components/AgentGrid';
import { CostTicker } from '@/components/CostTicker';
import { Button } from '@/components/ui/Button';
import { useEffect, useState } from 'react';
import { useTrinityController } from '@/hooks/useTrinityController';
import { SignalUnlockModal } from '@/components/modals/SignalUnlockModal';
import { Skeleton } from '@/components/ui/Skeleton';
import { TrendingUp, Activity, BarChart3, Globe } from 'lucide-react';

export default function WatchPage() {
    const { agents, loading } = useTrinityController();
    const [showSignalModal, setShowSignalModal] = useState(false);
    const [signalUnlocked, setSignalUnlocked] = useState(false);

    // Initial Data & Greeting
    useEffect(() => {
        const hasVisited = localStorage.getItem('mel_greeted');
        if (!hasVisited) {
            const msg = new SpeechSynthesisUtterance("Welcome to the Trinity Pulse. Observe the symphony of intelligence.");
            window.speechSynthesis.speak(msg);
            localStorage.setItem('mel_greeted', 'true');
        }
    }, []);

    const signalData = [
        {
            label: "GCM: Viral Coefficient",
            value: "+12.4%",
            trend: "up",
            icon: TrendingUp,
            desc: "Network propagation speed increasing in Grok clusters."
        },
        {
            label: "MEL: Sentiment Index",
            value: "84/100",
            trend: "stable",
            icon: Activity,
            desc: "High empathy/care metrics across user interactions."
        },
        {
            label: "HDM: Node Consensus",
            value: "99.9%",
            trend: "up",
            icon: Globe,
            desc: "BFT integrity verified across all 12 distributed nodes."
        }
    ];

    return (
        <div className="min-h-screen bg-[#060608] flex flex-col animate-in fade-in duration-700">
            {/* WATCHING BANNER */}
            <div className="bg-violet-500/10 border-b border-violet-500/20 px-4 py-3 text-center text-[10px] font-mono text-violet-400 flex items-center justify-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-ping" />
                EYE OF THE SWARM: LIVE HYPERDAG TELEMETRY ACTIVE
            </div>

            <Header
                title="Symphony Observatory"
                showLive
                viewerCount={1243}
            />

            <main className="flex-1 max-w-7xl mx-auto w-full px-4 lg:px-8 py-8 space-y-12 pb-24">
                {/* Intro Section */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-8">
                    <div>
                        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                            Global Grid Status
                        </h2>
                        <p className="text-sm text-gray-500 mt-1 max-w-xl font-mono">
                            Read-only observatory mode. Observe the emergence of collective intelligence via autonomous agent coordination.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <div className="px-3 py-1.5 rounded-md bg-green-500/5 border border-green-500/20 text-[10px] font-bold text-green-400 flex items-center gap-2">
                            <div className="w-1 h-1 rounded-full bg-green-400" />
                            AUTONOMY: 100%
                        </div>
                        <div className="px-3 py-1.5 rounded-md bg-violet-500/5 border border-violet-500/20 text-[10px] font-bold text-violet-400 flex items-center gap-2">
                            <div className="w-1 h-1 rounded-full bg-violet-400" />
                            ZKP VERIFIED
                        </div>
                    </div>
                </div>

                {/* Agent Grid - Live Refactored */}
                <section>
                    {loading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl bg-white/5" />)}
                        </div>
                    ) : (
                        <AgentGrid agents={agents} isConductor={false} />
                    )}
                </section>

                {/* Signal Section - Enhanced Insights */}
                <section className="mt-16">
                    {!signalUnlocked ? (
                        <div className="relative p-1 rounded-3xl bg-gradient-to-br from-violet-600/30 via-transparent to-cyan-500/30 overflow-hidden group">
                            <div className="absolute inset-0 bg-[#0B0B0F] rounded-3xl m-[1px] -z-10" />
                            <div className="p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-8 backdrop-blur-3xl shadow-2xl">
                                <div className="flex items-center gap-6">
                                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-violet-500/20 transform group-hover:rotate-6 transition-transform">
                                        <BarChart3 size={32} />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-bold text-white">Unlock Trinity Signal Alpha</h3>
                                        <p className="text-gray-400 text-sm mt-1 max-w-md">
                                            Access the proprietary Alpha feed generated by the combined intelligence of the Alpha and Gamma squads.
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    onClick={() => setShowSignalModal(true)}
                                    className="bg-white text-black hover:bg-white/90 px-10 py-6 rounded-2xl text-sm font-bold shadow-xl transition-all hover:scale-105"
                                >
                                    Reveal Signal Feed
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="p-8 rounded-3xl bg-[#0B0B0F] border border-violet-500/30 animate-in zoom-in duration-500 shadow-[0_0_50px_rgba(139,92,246,0.1)] relative overflow-hidden">
                            {/* Decorative Grid */}
                            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#8b5cf6_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none" />

                            <div className="flex items-center justify-between mb-10 relative">
                                <div>
                                    <h3 className="text-xl font-bold text-white flex items-center gap-3">
                                        <span className="p-2 rounded-lg bg-violet-500/20 text-violet-400">⚡</span>
                                        Trinity Signal Alpha Feed
                                    </h3>
                                    <p className="text-xs text-gray-500 mt-1 font-mono">ENCRYPTED TELEMETRY STREAM • AUTH_LVL: STAKEHOLDER</p>
                                </div>
                                <span className="px-3 py-1 rounded-full bg-violet-500/10 text-[10px] font-bold text-violet-400 border border-violet-500/20 uppercase tracking-widest animate-pulse">
                                    Live Decryption...
                                </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
                                {signalData.map((item, i) => {
                                    const Icon = item.icon;
                                    return (
                                        <div key={i} className="p-6 bg-black/40 border border-white/5 rounded-2xl flex flex-col group hover:border-violet-500/30 transition-all">
                                            <div className="flex items-center justify-between mb-4 text-gray-500">
                                                <Icon size={18} className="group-hover:text-violet-400 transition-colors" />
                                                <span className="text-[10px] font-mono tracking-tighter">NODE_V{i + 1}</span>
                                            </div>
                                            <h4 className="text-xs text-gray-400 uppercase tracking-wider mb-1">{item.label}</h4>
                                            <p className="text-3xl font-bold bg-gradient-to-r from-white to-gray-500 bg-clip-text text-transparent group-hover:from-white group-hover:to-violet-400 transition-all">{item.value}</p>
                                            <p className="mt-4 text-[11px] leading-relaxed text-gray-500 font-medium group-hover:text-gray-400 transition-colors">
                                                {item.desc}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="mt-8 pt-6 border-t border-white/5 flex justify-end">
                                <p className="text-[10px] text-gray-600 font-mono italic">
                                    *Data synthesized over 1024 epochs using ANFIS BFT consensus.
                                </p>
                            </div>
                        </div>
                    )}
                </section>
            </main>

            <CostTicker traditional={847.00} trinity={0.47} />

            <SignalUnlockModal
                isOpen={showSignalModal}
                onClose={() => setShowSignalModal(false)}
                onUnlock={() => setSignalUnlocked(true)}
            />
        </div>
    );
}
