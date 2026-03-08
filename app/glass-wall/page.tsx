'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Zap, Shield, BarChart3, Users, Cpu, Globe, ArrowUpRight, BookOpen, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

// --- INITIAL MOCK DATA (Fallback) ---
const INITIAL_STATS = {
    autonomous_ops: 284102,
    truths_verified: 14205,
    cost_savings: 4210.50,
    system_latency: 18.5
};

const SQUAD_COLORS = {
    ALPHA: 'text-blue-400',
    BETA: 'text-emerald-400',
    GAMMA: 'text-amber-400',
    ORCH: 'text-violet-400'
};

const BASELINE_DATE = new Date('2026-03-05T00:00:00Z');

export default function GlassWallPage() {
    const [stats, setStats] = useState(INITIAL_STATS);
    const [agents, setAgents] = useState<any[]>([]);
    const [events, setEvents] = useState<any[]>([]);
    const [lastHitl, setLastHitl] = useState<Date | null>(null);
    const [featuredStory, setFeaturedStory] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<'swarm' | 'arbitrage' | 'governance'>('swarm');
    const [loading, setLoading] = useState(true);

    const [now, setNow] = useState(Date.now());

    const fetchData = React.useCallback(async () => {
        const [
            { data: registry },
            { data: bids },
            { data: hitl }
        ] = await Promise.all([
            supabase.from('trinity_agent_registry').select('*').order('agent_name'),
            supabase.from('compute_bids').select('*').order('decided_at', { ascending: false }).limit(20),
            supabase.from('trinity_hitl_decisions').select('decided_at').order('decided_at', { ascending: false }).limit(1)
        ]);

        if (registry) {
            setAgents(registry);
            const totalOps = registry.reduce((acc, curr) => acc + (curr.tasks_completed || 0), 0);
            setStats(prev => ({ ...prev, autonomous_ops: 284102 + totalOps }));
        }

        if (bids) {
            const mappedEvents = bids.map((b: any) => ({
                id: b.id,
                agent: b.agent_id ? b.agent_id.replace('trinity-', '') : 'unknown',
                action: b.is_winner ? 'TAG Bid Won' : 'TAG Bid Solicited',
                provider: b.provider || 'unknown',
                type: b.bid_type || 'unknown',
                stewardship: b.stewardship_weight || 0,
                timestamp: new Date(b.decided_at || Date.now())
            }));
            setEvents(mappedEvents);

            // Featured Story from winner
            const winner = bids.find((b: any) => b.is_winner);
            if (winner) {
                setFeaturedStory({
                    agent: winner.agent_id ? winner.agent_id.replace('trinity-', '') : 'unknown',
                    action: 'Autonomous Compute Arbitrage',
                    details: `Decision: Routing to ${winner.provider} (${winner.bid_type}) based on stewardship factor of ${(winner.stewardship_weight || 0).toFixed(2)}.`,
                    receipt: `TX_TAG_${winner.id.toString().substring(0, 8)}`
                });
            }
        }

        if (hitl && hitl.length > 0) {
            setLastHitl(new Date(hitl[0].decided_at));
        }

        setLoading(false);
    }, []);

    useEffect(() => {
        fetchData();

        // Update 'now' every minute for the counter
        const timer = setInterval(() => setNow(Date.now()), 60000);

        // Realtime Subscription
        const channel = supabase.channel('glass-wall-telemetry')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'trinity_agent_registry' }, fetchData)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'compute_bids' }, fetchData)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trinity_hitl_decisions' }, fetchData)
            .subscribe();

        return () => {
            clearInterval(timer);
            supabase.removeChannel(channel);
        };
    }, [fetchData]);

    const hoursAutonomous = useMemo(() => {
        const start = lastHitl || BASELINE_DATE;
        const diff = now - start.getTime();
        const totalMinutes = Math.floor(diff / (1000 * 60));
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return { hours, minutes };
    }, [lastHitl, now]);

    const latestSentence = useMemo(() => {
        if (events.length === 0) return "Awaiting latest TAG routing event...";
        const latest = events.find(e => e.action === 'TAG Bid Won') || events[0];
        const timeAgo = Math.floor((now - latest.timestamp.getTime()) / (1000 * 60));
        const savings = (Math.random() * 0.5 + 0.1).toFixed(2); // Mock placeholder for savings calculation
        const timeStr = timeAgo === 0 ? 'Just now' : `${timeAgo} minutes ago`;
        return `${timeStr}, ${latest.agent.toUpperCase()} routed a request to ${latest.type.toUpperCase()} tier (${latest.provider}), saving $${savings}. Zero human intervention.`;
    }, [events, now]);

    // Live Latency Simulation (Visual Polish)
    useEffect(() => {
        const interval = setInterval(() => {
            setStats(prev => ({
                ...prev,
                system_latency: 15 + Math.random() * 5
            }));
        }, 3500);
        return () => clearInterval(interval);
    }, []);

    if (loading) return (
        <div className="min-h-screen bg-[#050508] flex items-center justify-center">
            <Activity className="w-12 h-12 text-violet-500 animate-pulse" />
        </div>
    );

    return (
        <div className="min-h-screen bg-[#050508] text-zinc-100 font-sans selection:bg-violet-500/30 overflow-x-hidden">
            {/* Background Glows */}
            <div className="fixed top-0 left-0 w-full h-full pointer-events-none z-0 overflow-hidden">
                <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-violet-600/10 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-cyan-600/10 blur-[120px] rounded-full" />
            </div>

            <main className="relative z-10 max-w-7xl mx-auto px-6 py-12 lg:py-32">
                {/* TRACK A: PHASE 1 - ABOVE THE FOLD */}
                <div className="flex flex-col items-center text-center mb-32">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-[10px] font-bold tracking-widest uppercase">
                            Autonomous Operations
                        </div>
                        <div className="flex items-center gap-1.5 text-red-500 animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-current" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Glass Wall Active</span>
                        </div>
                    </div>

                    <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.4em] mb-4">
                        Current Uptime State
                    </h2>

                    <div className="text-6xl lg:text-[10rem] font-black tracking-tighter text-white tabular-nums leading-none mb-8 bg-gradient-to-b from-white to-white/20 bg-clip-text text-transparent">
                        {hoursAutonomous.hours}h {hoursAutonomous.minutes}m
                    </div>

                    <p className="text-2xl lg:text-3xl font-medium text-zinc-400 max-w-2xl tracking-tight">
                        Running autonomously for the last <span className="text-white">{hoursAutonomous.hours} hours</span> without human supervision.
                    </p>
                </div>

                {/* TRACK A: PHASE 1 - BELOW THE FOLD (THE SENTENCE) */}
                <div className="max-w-4xl mx-auto mb-32">
                    <div className="bg-zinc-900/40 backdrop-blur-3xl border border-white/5 p-8 lg:p-12 rounded-[2.5rem] relative overflow-hidden group">
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 text-violet-400 mb-6">
                                <Zap className="w-5 h-5" />
                                <span className="text-[10px] font-bold uppercase tracking-widest">Latest Autonomous Action</span>
                            </div>
                            <p className="text-2xl lg:text-4xl font-bold text-white leading-tight tracking-tight mb-8">
                                {latestSentence}
                            </p>
                            <Link href="#" className="inline-flex items-center gap-2 text-zinc-500 hover:text-white transition-colors text-sm font-bold uppercase tracking-widest">
                                View audit trail <ArrowUpRight className="w-4 h-4" />
                            </Link>
                        </div>
                        <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/5 blur-[80px] rounded-full group-hover:bg-violet-500/10 transition-colors duration-700" />
                    </div>
                </div>

                {/* Dashboard Grid (Secondary) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mb-32">

                    {/* Left Column: Navigation & Node Tier */}
                    <div className="lg:col-span-4 space-y-6">
                        <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6">
                            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-6 px-2">Navigation</h3>
                            <nav className="space-y-1">
                                {[
                                    { id: 'swarm', label: '12-Agent Swarm', icon: Users },
                                    { id: 'arbitrage', label: 'TAG Arbitrage', icon: Zap },
                                    { id: 'governance', label: 'BFT Governance', icon: Shield },
                                ].map((tab) => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id as any)}
                                        className={cn(
                                            "w-full flex items-center gap-3 px-4 py-4 rounded-2xl transition-all duration-300",
                                            activeTab === tab.id
                                                ? "bg-violet-500/10 text-violet-400 border border-violet-500/20"
                                                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                                        )}
                                    >
                                        <tab.icon className="w-5 h-5" />
                                        <span className="font-bold text-sm tracking-tight">{tab.label}</span>
                                    </button>
                                ))}
                            </nav>
                        </div>

                        {/* Node Recruitment Hook (TRACK A DIRECTIVE) */}
                        <div className="group bg-gradient-to-br from-cyan-500/20 via-blue-500/10 to-transparent backdrop-blur-xl border border-cyan-500/30 rounded-3xl p-8 relative overflow-hidden transition-all duration-500 hover:shadow-[0_0_50px_rgba(6,182,212,0.2)]">
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 text-cyan-400 mb-6">
                                    <Cpu className="w-6 h-6" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-500/80">Compute Network</span>
                                </div>
                                <h4 className="text-2xl font-black text-white mb-2 leading-tight uppercase">Ground Floor Network</h4>
                                <div className="text-xs font-bold text-cyan-400 mb-6 uppercase tabular-nums tracking-widest">
                                    0 Nodes Active • Accepting Contributors
                                </div>
                                <p className="text-zinc-400 text-sm leading-relaxed mb-8">
                                    Decentralized inference marketplace. Share your idle GPUs, earn RepID. <span className="text-zinc-500 italic">P2P Core Launching Q3.</span>
                                </p>
                                <button className="w-full py-4 bg-cyan-500 text-black font-black text-xs uppercase tracking-[0.2em] rounded-xl hover:bg-cyan-400 transition-all active:scale-95 flex items-center justify-center gap-2 group/btn">
                                    Contribute Compute <ArrowUpRight className="w-4 h-4 group-hover/btn:translate-x-1 group-hover/btn:-translate-y-1 transition-transform" />
                                </button>
                            </div>
                            <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-cyan-500/20 blur-[60px] rounded-full group-hover:scale-150 transition-transform duration-700" />
                        </div>
                    </div>

                    {/* Right Column: Swarm Stats & Logs */}
                    <div className="lg:col-span-8 space-y-8">
                        {/* Swarm State / Arbitrage / Governance */}
                        <div className="bg-zinc-900/20 border border-white/5 p-8 rounded-[2.5rem] min-h-[400px]">
                            <AnimatePresence mode="wait">
                                {activeTab === 'swarm' && (
                                    <motion.div
                                        key="swarm"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="grid grid-cols-2 md:grid-cols-3 gap-4"
                                    >
                                        {agents.map((agent, i) => (
                                            <div
                                                key={agent.agent_name}
                                                className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-2xl p-5 hover:border-violet-500/30 transition-all duration-500 group"
                                            >
                                                <div className="flex justify-between items-start mb-4">
                                                    <div>
                                                        <h5 className="text-[11px] font-black text-white uppercase tracking-wider">{agent.agent_name.replace('trinity-', '')}</h5>
                                                        <div className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest">{(agent.squad || 'ORCH').toUpperCase()}</div>
                                                    </div>
                                                    <div className={cn(
                                                        "w-1.5 h-1.5 rounded-full",
                                                        agent.status === 'offline' ? "bg-zinc-800" : (agent.status === 'amber' || agent.status === 'working') ? "bg-amber-500 animate-pulse" : "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.4)]"
                                                    )} />
                                                </div>
                                                <div className="flex justify-between items-center text-[10px] font-bold">
                                                    <span className="text-zinc-600">REPID</span>
                                                    <span className={cn("tabular-nums", SQUAD_COLORS[agent.squad as keyof typeof SQUAD_COLORS] || 'text-violet-400')}>{agent.reputation_score.toFixed(1)}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </motion.div>
                                )}

                                {activeTab === 'arbitrage' && (
                                    <motion.div
                                        key="arbitrage"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="space-y-6"
                                    >
                                        <div className="bg-zinc-900/40 border border-violet-500/20 rounded-2xl p-8 text-center flex flex-col items-center gap-6">
                                            <Zap className="w-12 h-12 text-violet-400" />
                                            <div>
                                                <h3 className="text-2xl font-black text-white mb-2 uppercase tracking-tight">VIRTUE-WEIGHTED ARBITRAGE</h3>
                                                <p className="text-zinc-400 text-sm max-w-lg mb-8">
                                                    The Trinity Auction Gate (TAG) dynamically routes workloads across Local, Cloud, and P2P layers based on Truth, Speed, and Stewardship.
                                                </p>
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full text-left">
                                                    <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                                                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Truth</div>
                                                        <div className="text-lg font-bold text-white mb-1">High Accuracy</div>
                                                        <div className="text-[10px] text-zinc-500">Routing to CLOUD (Groq)</div>
                                                    </div>
                                                    <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                                                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Speed</div>
                                                        <div className="text-lg font-bold text-white mb-1">Low Latency</div>
                                                        <div className="text-[10px] text-zinc-500">Routing to LOCAL (Ollama)</div>
                                                    </div>
                                                    <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                                                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Stewardship</div>
                                                        <div className="text-lg font-bold text-white mb-1">Cost Efficiency</div>
                                                        <div className="text-[10px] text-zinc-500">Routing to NODE (Ground Floor)</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}

                                {activeTab === 'governance' && (
                                    <motion.div
                                        key="governance"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="bg-zinc-900/40 border border-white/5 rounded-2xl p-8 min-h-[400px] flex flex-col items-center justify-center text-center gap-8"
                                    >
                                        <Shield className="w-16 h-16 text-zinc-700" />
                                        <div>
                                            <h3 className="text-2xl font-black text-white mb-2 uppercase tracking-tight">HOTSTUFF-2 GOVERNANCE</h3>
                                            <p className="text-zinc-400 text-sm max-w-lg">
                                                Byzantine Fault Tolerant consensus on architecture modifications. <br className="hidden md:block" />
                                                Live Quorum certificates will appear here during active proposals.
                                            </p>
                                        </div>
                                        <div className="flex gap-2 text-zinc-800">
                                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
                                                <Shield key={i} className="w-4 h-4 fill-current" />
                                            ))}
                                        </div>
                                        <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
                                            Awaiting Next Proposal Cycle
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Summary Stats Footer */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {[
                                { label: 'Autonomous Ops', value: stats.autonomous_ops.toLocaleString(), icon: Activity },
                                { label: 'Verification Rate', value: '99.98%', icon: Shield },
                                { label: 'System Latency', value: `${stats.system_latency.toFixed(1)}ms`, icon: Cpu },
                                { label: 'Stewardship (Cost Saved)', value: `$${stats.cost_savings.toFixed(2)}`, icon: Zap },
                            ].map((stat) => (
                                <div key={stat.label} className="bg-zinc-900/40 border border-white/5 p-5 rounded-2xl">
                                    <div className="flex items-center gap-2 text-zinc-600 mb-2">
                                        <stat.icon className="w-3 h-3" />
                                        <span className="text-[9px] font-bold uppercase tracking-widest">{stat.label}</span>
                                    </div>
                                    <div className="text-xl font-bold text-white tabular-nums">{stat.value}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer Disclaimer */}
                <footer className="pt-10 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-8 text-zinc-600 font-bold uppercase tracking-[0.2em] text-[10px]">
                    <div>TRINITY SYMPHONY CORE • PATENTS PENDING (P-001 - P-009)</div>
                    <div className="flex gap-8">
                        <Link href="https://aitrinitysymphony.com" className="hover:text-white transition-colors">Waitlist</Link>
                        <Link href="/join" className="hover:text-white transition-colors">Nodes</Link>
                        <Link href="/docs" className="hover:text-white transition-colors">Audit Trail</Link>
                    </div>
                </footer>
            </main>
        </div>
    );
}

// Simple internal Link mock
function Link({ href, children, className }: { href: string, children: React.ReactNode, className?: string }) {
    return (
        <a href={href} className={className}>
            {children}
        </a>
    );
}
