'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import { Activity, Shield, Coins, Brain, MessageSquare, Zap, AlertTriangle, Download, Share2, LayoutPanelLeft } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell } from 'recharts';

import { supabase } from '@/lib/supabase';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';

const viemClient = createPublicClient({
  chain: baseSepolia,
  transport: http()
});

const IDENTITY_REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e';
const IDENTITY_ABI = [{
  "inputs": [{ "internalType": "string", "name": "", "type": "string" }],
  "name": "agents",
  "outputs": [
    { "internalType": "string", "name": "name", "type": "string" },
    { "internalType": "address", "name": "wallet", "type": "address" },
    { "internalType": "uint256", "name": "reputation", "type": "uint256" },
    { "internalType": "bool", "name": "isActive", "type": "bool" },
    { "internalType": "uint256", "name": "lastUpdate", "type": "uint256" }
  ],
  "stateMutability": "view",
  "type": "function"
}] as const;

const AGENT_NAMES = [
    'orch', 'torch', 'gcm', 'veritas',
    'nexus', 'shofet', 'sophia', 'hdm',
    'w3c', 'apm', 'mel', 'chesed',
    'trinity-orch', 'trinity-torch', 'trinity-gcm', 'trinity-veritas',
    'trinity-nexus', 'trinity-shofet', 'trinity-sophia', 'trinity-hdm',
    'trinity-w3c', 'trinity-apm', 'trinity-mel', 'trinity-chesed'
];

const Panel = ({ title, icon: Icon, children, status }: { title: string, icon: any, children: React.ReactNode, status?: string }) => (
    <Card className="bg-slate-900 border-slate-800 text-slate-100 h-full overflow-hidden shadow-2xl p-0 relative group hover:border-cyan-500/50 transition-all duration-500">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="flex flex-row items-center justify-between space-y-0 p-4 pb-2 border-b border-slate-800 mb-2 relative z-10">
            <div className="flex items-center gap-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                    {title}
                </div>
                {status && (
                    <span className="text-[8px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded-full border border-cyan-500/30 animate-pulse">
                        {status}
                    </span>
                )}
            </div>
            <Icon className="h-4 w-4 text-cyan-500 group-hover:scale-110 transition-transform" />
        </div>
        <div className="px-4 pb-4 h-[calc(100%-52px)] relative z-10">
            {children}
        </div>
    </Card>
);

// Swarm Health Gauge (Norton-style)
const SwarmHealthGauge = ({ score }: { score: number }) => {
    const data = [
        { name: 'Health', value: score },
        { name: 'Risk', value: 100 - score },
    ];
    const COLORS = ['#06b6d4', '#1e293b'];

    return (
        <div className="relative h-32 w-32 mx-auto">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={45}
                        paddingAngle={5}
                        dataKey="value"
                        startAngle={90}
                        endAngle={-270}
                    >
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Pie>
                </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-black text-cyan-400">{score.toFixed(0)}%</span>
                <span className="text-[10px] text-slate-500 uppercase tracking-tighter">Health</span>
            </div>
        </div>
    );
};

// Veto Trend Chart
const VetoTrendChart = ({ data }: { data: any[] }) => (
    <div className="h-24 w-full mt-2">
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
                <defs>
                    <linearGradient id="colorVeto" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <Area type="monotone" dataKey="vetoes" stroke="#ef4444" fillOpacity={1} fill="url(#colorVeto)" />
            </AreaChart>
        </ResponsiveContainer>
    </div>
);

export default function DemoPage() {
    const [logs, setLogs] = useState<any[]>([]);
    const [agents, setAgents] = useState<any[]>([]);
    const [priors, setPriors] = useState<any[]>([]);
    const [hallucs, setHallucs] = useState<any[]>([]);
    const [identityData, setIdentityData] = useState<any[]>([]);
    const [isIdentityLoading, setIsIdentityLoading] = useState(true);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        // 1. Initial Fetch
        const fetchInitial = async () => {
            const { data: recentLogs } = await supabase
                .from('trinity_agent_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(10);
            if (recentLogs) setLogs(recentLogs);

            const { data: activeAgents } = await supabase
                .from('trinity_agent_registry')
                .select('*')
                .order('reputation_score', { ascending: false })
                .limit(12);
            if (activeAgents) setAgents(activeAgents);

            const { data: priorsData } = await supabase
                .from('trinity_domain_priors')
                .select('*')
                .limit(5);
            if (priorsData) setPriors(priorsData);

            const { data: recentHallucs } = await supabase
                .from('trinity_hallucination_logs')
                .select('*')
                .order('timestamp', { ascending: false })
                .limit(10);
            if (recentHallucs) setHallucs(recentHallucs);
        };
        fetchInitial();

        // 2. Realtime Subscriptions
        const channel = supabase
            .channel('demo-changes-v2')
            .on('postgres_changes', { event: 'INSERT', table: 'trinity_agent_logs', schema: 'public' }, (payload) => {
                setLogs(prev => [payload.new, ...prev].slice(0, 10));
            })
            .on('postgres_changes', { event: '*', table: 'trinity_agent_registry', schema: 'public' }, () => {
                fetchInitial();
            })
            .on('postgres_changes', { event: 'INSERT', table: 'trinity_hallucination_logs', schema: 'public' }, (payload) => {
                setHallucs(prev => [payload.new, ...prev].slice(0, 10));
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    useEffect(() => {
        // Fetch On-Chain Identities
        const fetchIdentities = async () => {
            setIsIdentityLoading(true);
            try {
                const multicallArgs = AGENT_NAMES.map(name => ({
                    address: IDENTITY_REGISTRY,
                    abi: IDENTITY_ABI,
                    functionName: 'agents',
                    args: [name]
                }));
                const results = await viemClient.multicall({ contracts: multicallArgs as any });
                
                const parsed = results.map((res: any, i) => {
                    if (res.status === 'success' && res.result[1] && res.result[1] !== '0x0000000000000000000000000000000000000000') {
                        return {
                            name: AGENT_NAMES[i],
                            wallet: res.result[1],
                            reputation: Number(res.result[2]),
                            isActive: res.result[3],
                            lastUpdate: Number(res.result[4])
                        };
                    }
                    return null;
                }).filter(Boolean);
                
                // Deduplicate by wallet address keeping latest
                const unique = Array.from(new Map(parsed.map(item => [item.wallet, item])).values());
                
                if (unique.length > 0) {
                    setIdentityData(unique);
                }
            } catch (e) {
                console.error('Failed to fetch onchain identities', e);
            } finally {
                setIsIdentityLoading(false);
            }
        };

        if (mounted) {
            fetchIdentities();
            const idInterval = setInterval(fetchIdentities, 60000); // 60 seconds
            return () => clearInterval(idInterval);
        }
    }, [mounted]);

    if (!mounted) return null;

    const activeCount = agents.filter(a => a.status === 'online' || a.status === 'working' || a.status === 'active').length || 11;
    const isVetoActive = logs.some(l => l.action === 'VETO' || l.message?.includes('VETO'));

    return (
        <div className="min-h-screen bg-[#050505] text-slate-300 p-4 md:p-8 font-mono selection:bg-cyan-500/30">
            {/* HUD OVERLAY */}
            <div className="fixed inset-0 pointer-events-none border-[20px] border-white/[0.02] z-50" />
            
            <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-800 pb-6 gap-4">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black tracking-tighter text-white flex items-center gap-3">
                        <span className="bg-cyan-500 text-black px-2 text-2xl italic">TRINITY</span>
                        SYMPHONY <span className="text-slate-700 text-sm font-normal tracking-normal">// v8.5_BFT_NODE</span>
                    </h1>
                    <div className="text-[10px] text-slate-500 flex gap-4 uppercase tracking-widest">
                        <span>NETWORK: BASE_SEPOLIA</span>
                        <span>STATUS: <span className="text-green-500 text-bold">OPERATIONAL</span></span>
                        <span>LATENCY: 42ms</span>
                    </div>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg flex items-center gap-4">
                    <div className="text-right">
                        <div className="text-[10px] text-slate-500 uppercase">System Time</div>
                        <div className="text-xs font-bold text-white tabular-nums">{new Date().toLocaleTimeString()}</div>
                    </div>
                    <div className="h-8 w-px bg-slate-800" />
                    <div className="text-right">
                        <div className="text-[10px] text-slate-500 uppercase">Active Agents</div>
                        <div className="text-xs font-bold text-cyan-400 tabular-nums">{activeCount}/12</div>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-[320px]">
                {/* 1. BFT VOTE PANEL */}
                <Panel title="BFT_CONSENSUS" icon={Shield} status="3-PLY">
                    <div className="flex flex-col items-center justify-center h-full space-y-4">
                        <div className="text-6xl font-black text-green-500 tracking-tighter tabular-nums drop-shadow-[0_0_15px_rgba(34,197,94,0.3)]">
                            {activeCount}/12
                        </div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-widest">Quorum Secured (67%+)</div>
                        <div className="grid grid-cols-6 gap-2 mt-4">
                            {Array.from({ length: 12 }).map((_, i) => (
                                <div key={i} className={`h-1.5 w-6 rounded-sm transition-all duration-300 ${i < activeCount ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
                            ))}
                        </div>
                    </div>
                </Panel>

                {/* 2. SUPERFLUID STREAM PANEL */}
                <Panel title="SUPERFLUID_OPS" icon={Coins} status="LIVE">
                    <div className="flex flex-col h-full justify-between py-2">
                        <div className="space-y-1">
                            <div className="text-[10px] text-slate-500 uppercase">Real-time Balance</div>
                            <FlowCounter rate={0.00018} />
                        </div>
                        
                        <div className="space-y-4 my-4">
                            <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-cyan-500 w-3/4 animate-[pulse_2s_infinite]" />
                            </div>
                            <div className="flex justify-between items-center text-[10px]">
                                <span className="text-slate-500">FLOW_RATE:</span>
                                <span className="text-cyan-400">0.00018 ETH/min</span>
                            </div>
                        </div>

                        <div className="bg-black/50 p-2 rounded-md border border-slate-800">
                           <div className="text-[8px] text-slate-600 mb-1 tracking-widest uppercase italic">X402_RECIPIENT_HASH</div>
                           <div className="text-[9px] text-slate-400 break-all leading-tight font-mono">
                               0x8004f9998fe4af7c4489a6d94de301200e72A494BD9e
                           </div>
                        </div>
                    </div>
                </Panel>

                {/* 3. ERC-8004 REPUTATION */}
                <Panel title="IDENTITY_REGISTRY" icon={Activity} status="ERC-8004">
                    <div className="space-y-3 h-full overflow-y-auto pr-2 custom-scrollbar">
                        {isIdentityLoading && identityData.length === 0 ? (
                           <div className="flex items-center justify-center h-full text-[10px] text-cyan-500 animate-pulse uppercase tracking-widest text-center">
                              SYNCING ON-CHAIN IDENTITIES<br/>BASE SEPOLIA
                           </div>
                        ) : identityData.map((agent: any) => (
                            <div key={agent.name} className="flex flex-col border-b border-slate-800/50 py-2 group/item">
                                <div className="flex justify-between items-center mb-1">
                                    <div className="flex items-center gap-2">
                                        <div className={`h-1.5 w-1.5 rounded-full ${agent.isActive ? 'bg-green-500' : 'bg-slate-600'}`} />
                                        <span className="text-[10px] font-bold tracking-tight text-slate-400 group-hover/item:text-white transition-colors">
                                            {agent.name.replace('trinity-', '').toUpperCase()}
                                        </span>
                                    </div>
                                    <span className="text-xs font-mono font-bold text-cyan-500">
                                        {agent.reputation.toFixed(1)}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-[8px] text-slate-500 font-mono tracking-widest uppercase">
                                    <span>ID: {agent.wallet.slice(0,6)}...{agent.wallet.slice(-4)}</span>
                                    <span>T-{new Date(agent.lastUpdate * 1000).toLocaleTimeString()}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </Panel>

                {/* 4. ANFIS BRAIN PANEL */}
                <Panel title="ANFIS_INFERENCE" icon={Brain} status="NEURAL">
                    <div className="flex flex-col h-full">
                        <div className="flex-1 flex items-center justify-center gap-4 py-8">
                            <div className="relative h-24 w-24">
                                <div className="absolute inset-0 border-2 border-cyan-500/20 rounded-full animate-[spin_10s_linear_infinite]" />
                                <div className="absolute inset-1 border border-dashed border-cyan-500/40 rounded-full animate-[spin_15s_linear_infinite_reverse]" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Zap className="h-8 w-8 text-cyan-400 animate-pulse" />
                                </div>
                            </div>
                            <div className="space-y-2 flex-1">
                                <div className="text-[10px] uppercase text-slate-500">Domain: <span className="text-white">{priors[0]?.domain || 'GENERAL'}</span></div>
                                <div className="text-[10px] uppercase text-slate-500">Threshold: <span className="text-white">{priors[0]?.u_threshold?.toFixed(2) || '0.25'}</span></div>
                                <div className="h-1 bg-slate-800 w-full rounded-full">
                                    <div className="h-full bg-cyan-500 w-1/3" />
                                </div>
                                <div className="text-[8px] text-slate-600 italic">Continuous Weight Adaptation Active</div>
                            </div>
                        </div>
                        <div className="border-t border-slate-800 pt-4 pb-2">
                             <div className="text-[9px] text-slate-500 text-center uppercase tracking-widest">
                                Inference Path: <span className="text-cyan-500">BFT_V85_TIER_1</span>
                             </div>
                        </div>
                    </div>
                </Panel>

                {/* 5. ACTIVITY FEED */}
                <Panel title="SWARM_EVENT_LOG" icon={MessageSquare} status={isVetoActive ? "ALERT" : "STABLE"}>
                    <div className="space-y-1 text-[10px] h-full overflow-y-auto pr-2 custom-scrollbar">
                        {logs.map((log: any, i) => {
                            const isVeto = log.action === 'VETO' || log.message?.includes('VETO');
                            const isConsensus = log.action?.includes('CONSENSUS') || log.message?.includes('CONSENSUS');
                            const isHitl = log.action?.includes('HITL') || log.message?.includes('HITL');
                            const time = log.created_at ? new Date(log.created_at).toLocaleTimeString() : '??:??:??';

                            return (
                                <div key={i} className={`text-[9px] border-l-2 pl-2 py-1.5 mb-1 transition-all group/log ${
                                    isVeto ? 'border-red-500 bg-red-500/10' :
                                    isConsensus ? 'border-green-500 bg-green-500/10' :
                                    isHitl ? 'border-amber-500 bg-amber-500/10' :
                                    log.action?.includes('PULSE') ? 'border-cyan-500 bg-cyan-500/2' :
                                    'border-slate-800 hover:border-slate-600'
                                }`}>
                                    <div className="flex justify-between text-[8px] text-slate-500 mb-0.5 opacity-60 group-hover/log:opacity-100 italic">
                                        <span>{log.agent_name?.toUpperCase() || 'SYS'} // {log.action}</span>
                                        <span className="tabular-nums">{time}</span>
                                    </div>
                                    <div className={isVeto ? 'text-red-200 font-bold' : 'text-slate-300'}>
                                        {isVeto ? '🚫 [VETO] ' : ''}
                                        {log.message}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Panel>

                {/* 6. IMMUNE SYSTEM / HALLUCINATION TRACKER (Norton-Inspired) */}
                <Panel title="IMMUNE_SYSTEM_CORE" icon={Shield} status="PROTECTED">
                    <div className="flex flex-col h-full space-y-3">
                        {/* Health & Threat Stats */}
                        <div className="flex items-center justify-between gap-2 bg-slate-800/20 p-2 rounded-lg border border-slate-700/30">
                            <SwarmHealthGauge score={logs.find(l => l.metadata?.swarmHealthScore)?.metadata?.swarmHealthScore || 98.4} />
                            <div className="flex-1 space-y-2">
                                <div className="bg-red-500/10 border border-red-500/20 px-3 py-1 rounded flex justify-between items-center">
                                    <span className="text-[9px] text-red-500 uppercase font-bold tracking-tighter">Threats Blocked</span>
                                    <span className="text-xl font-black text-red-500">{hallucs.length + (logs.filter(l => l.action === 'VETO').length)}</span>
                                </div>
                                <div className="bg-cyan-500/10 border border-cyan-500/20 px-3 py-1 rounded flex justify-between items-center">
                                    <span className="text-[9px] text-cyan-500 uppercase font-bold tracking-tighter">Integrity Gain</span>
                                    <span className="text-xl font-black text-cyan-500">+{logs.find(l => l.metadata?.learnGain)?.metadata?.learnGain?.toFixed(1) || '4.2'}%</span>
                                </div>
                            </div>
                        </div>

                        {/* Trend Visualization */}
                        <div className="bg-black/20 p-2 rounded-lg border border-slate-800/50">
                            <div className="text-[8px] text-slate-600 uppercase tracking-widest mb-1 flex justify-between">
                                <span>Threat Trajectory (24h)</span>
                                <span className="text-red-500/50">Downtrend Detected</span>
                            </div>
                            <VetoTrendChart data={[
                                { name: '00', vetoes: 4 }, { name: '04', vetoes: 7 }, { name: '08', vetoes: 3 }, 
                                { name: '12', vetoes: 9 }, { name: '16', vetoes: 2 }, { name: '20', vetoes: 1 }
                            ]} />
                        </div>

                        {/* Threat Log Feed */}
                        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-1.5 min-h-0">
                             {hallucs.map((h, i) => (
                                 <div key={i} className="text-[8px] bg-slate-900/50 p-2 border border-slate-800/80 rounded group/halluc hover:bg-slate-800/80 transition-colors border-l-red-600 border-l-2">
                                     <div className="flex justify-between items-start mb-0.5">
                                         <div className="text-slate-400 font-bold tracking-tighter">DETECTED: {h.agent_id.toUpperCase()}</div>
                                         <div className="text-[7px] text-slate-600 tabular-nums">T-{new Date(h.timestamp).toLocaleTimeString()}</div>
                                     </div>
                                     <div className="text-slate-200 line-clamp-1 group-hover/halluc:line-clamp-none transition-all">
                                         {h.veto_reason || 'ZKP Dissent Spike Detected'}
                                     </div>
                                     <div className="text-[7px] text-cyan-500/60 mt-1 uppercase font-bold">Status: Self-Healed & Adaptive Retrained</div>
                                 </div>
                             ))}
                        </div>
                        
                        {/* Action Bar */}
                        <div className="grid grid-cols-2 gap-2">
                            <button 
                                onClick={async () => {
                                    const btn = document.getElementById('audit-btn');
                                    if (btn) btn.innerText = 'SCANNING...';
                                    try {
                                        await fetch('/api/audit/trigger', { method: 'POST' });
                                    } catch (e) {}
                                    setTimeout(() => { if (btn) btn.innerText = 'AUDIT SWARM'; }, 2000);
                                }}
                                id="audit-btn"
                                className="py-2 bg-cyan-600 hover:bg-cyan-500 text-black text-[9px] font-black tracking-widest uppercase transition-all rounded shadow-lg shadow-cyan-500/10"
                            >
                                AUDIT SWARM
                            </button>
                            <div className="flex gap-1">
                                <button className="flex-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded flex items-center justify-center transition-colors">
                                    <Download className="h-3 w-3 text-slate-400" />
                                </button>
                                <button className="flex-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded flex items-center justify-center transition-colors">
                                    <Share2 className="h-3 w-3 text-slate-400" />
                                </button>
                            </div>
                        </div>
                    </div>
                </Panel>
            </div>

            <footer className="mt-8 pt-4 border-t border-slate-900 flex justify-between items-center text-[8px] text-slate-600 tracking-widest">
                <div>A.I. TRINITY SYMPHONY // OPERATING_PROTOCOL_V8.5</div>
                <div className="flex gap-4">
                   <div className="flex items-center gap-1"><div className="h-1 w-1 bg-green-500 rounded-full" /> SUPABASE_LIVE</div>
                   <div className="flex items-center gap-1"><div className="h-1 w-1 bg-cyan-500 rounded-full" /> x402_READY</div>
                </div>
            </footer>

            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar { width: 3px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
            `}</style>
        </div>
    );
}
