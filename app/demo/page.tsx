'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Shield, Coins, Brain, MessageSquare } from 'lucide-react';

import { supabase } from '@/lib/supabase';

const Panel = ({ title, icon: Icon, children }: { title: string, icon: any, children: React.ReactNode }) => (
    <Card className="bg-slate-900 border-slate-800 text-slate-100 h-full overflow-hidden shadow-xl">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b border-slate-800 mb-4">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-slate-400">
                {title}
            </CardTitle>
            <Icon className="h-4 w-4 text-cyan-400" />
        </CardHeader>
        <CardContent className="h-[calc(100%-60px)]">
            {children}
        </CardContent>
    </Card>
);

export default function DemoPage() {
    const [logs, setLogs] = useState<any[]>([]);
    const [bftCount, setBftCount] = useState(11);
    const [agents, setAgents] = useState<any[]>([]);

    useEffect(() => {
        // 1. Initial Fetch
        const fetchInitial = async () => {
            const { data: recentTasks } = await supabase
                .from('trinity_agent_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(20);
            if (recentTasks) setLogs(recentTasks);

            const { data: activeAgents } = await supabase
                .from('agent_registry')
                .select('*')
                .limit(10);
            if (activeAgents) setAgents(activeAgents);
        };
        fetchInitial();

        // 2. Realtime Subscriptions
        const channel = supabase
            .channel('demo-changes')
            .on('postgres_changes', { event: 'INSERT', table: 'trinity_agent_logs', schema: 'public' }, (payload) => {
                setLogs(prev => [payload.new, ...prev].slice(0, 20));
            })
            .on('postgres_changes', { event: '*', table: 'agent_registry', schema: 'public' }, (payload) => {
                // Refresh agent list on any change
                fetchInitial();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);


    return (
        <div className="min-h-screen bg-black text-white p-6 font-mono">
            <header className="mb-8 flex justify-between items-center border-b border-slate-800 pb-4">
                <h1 className="text-2xl font-bold tracking-tighter text-cyan-500">TRINITY SYMPHONY // HACKATHON_DEMO</h1>
                <div className="text-xs text-slate-500">SYSTEM_TIME: {new Date().toLocaleTimeString()}</div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-[300px]">
                {/* 1. BFT VOTE PANEL */}
                <Panel title="BFT Consensus" icon={Shield}>
                    <div className="flex flex-col items-center justify-center h-full">
                        <div className="text-4xl font-black text-green-400">11/12</div>
                        <div className="text-xs text-slate-500 mt-2 italic">Fault Tolerance: Byzantine Stable</div>
                        <div className="mt-4 flex gap-1">
                            {Array.from({ length: 12 }).map((_, i) => (
                                <div key={i} className={`h-2 w-2 rounded-full ${i === 7 ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
                            ))}
                        </div>
                    </div>
                </Panel>

                {/* 2. SUPERFLUID STREAM PANEL */}
                <Panel title="Superfluid Flow" icon={Coins}>
                    <div className="space-y-4">
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">POOL: OPERATIONAL_RESERVE</span>
                            <span className="text-cyan-400">1.245 ETH</span>
                        </div>
                        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-cyan-500 w-3/4 animate-pulse" />
                        </div>
                        <div className="text-xs text-slate-400">
                            Flow Rate: 0.00018 ETH/min
                        </div>
                        <div className="text-[10px] text-slate-600 truncate">
                            RECIPIENT: 0x8004...A494BD9e
                        </div>
                    </div>
                </Panel>

                {/* 3. ERC-8004 REPUTATION */}
                <Panel title="ERC-8004 Identity" icon={Activity}>
                    <div className="space-y-2">
                        {['NEXUS', 'VERITAS', 'SOPHIA'].map(agent => (
                            <div key={agent} className="flex justify-between items-center border-b border-slate-800 py-1">
                                <span className="text-xs">{agent}</span>
                                <span className="text-xs font-bold text-cyan-400">88.5</span>
                            </div>
                        ))}
                        <div className="pt-4 text-center">
                            <div className="text-[10px] text-slate-500">IDENTITY_REGISTRY: BASE_SEPOLIA</div>
                        </div>
                    </div>
                </Panel>

                {/* 4. ANFIS BIDDER */}
                <Panel title="ANFIS Logic" icon={Brain}>
                    <div className="relative h-48 w-full mt-2">
                        {/* Mock neural net viz */}
                        <div className="absolute inset-0 flex items-center justify-around">
                            <div className="space-y-2">
                                <div className="h-1.5 w-12 bg-slate-700 rounded-full" />
                                <div className="h-1.5 w-12 bg-slate-700 rounded-full" />
                                <div className="h-1.5 w-12 bg-cyan-500 rounded-full" />
                            </div>
                            <div className="h-12 w-12 rounded-full border border-cyan-500/50 flex items-center justify-center">
                                <span className="text-[10px] text-cyan-400">FUZZY</span>
                            </div>
                            <div className="space-y-4">
                                <div className="h-1.5 w-12 bg-slate-700 rounded-full" />
                                <div className="h-1.5 w-12 bg-slate-700 rounded-full" />
                            </div>
                        </div>
                        <div className="absolute bottom-0 w-full text-center text-[10px] text-slate-500">
                            INFERENCE: LLM_TIER_1 (SiliconFlow)
                        </div>
                    </div>
                </Panel>

                {/* 5. ACTIVITY FEED */}
                <Panel title="Swarm Events" icon={MessageSquare}>
                    <div className="space-y-1 text-[10px] h-full overflow-y-auto pr-2 custom-scrollbar">
                        {logs.map((log, i) => (
                            <div key={i} className="flex gap-2">
                                <span className="text-slate-600">[{new Date().toLocaleTimeString()}]</span>
                                <span className={log.includes('Failed') || log.includes('error') ? 'text-red-400' : 'text-slate-300'}>{log}</span>
                            </div>
                        ))}
                    </div>
                </Panel>
            </div>

            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
            `}</style>
        </div>
    );
}
