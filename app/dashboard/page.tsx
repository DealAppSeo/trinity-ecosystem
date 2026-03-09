'use client';

import React, { useEffect, useState } from 'react';
import '../dashboard.css';

interface AgentStatus {
    name: string;
    repid: number;
    tier: string;
}

export default function HackathonDashboard() {
    const [agents, setAgents] = useState<AgentStatus[]>([
        { name: 'NEXUS', repid: 7240, tier: 'GOLD' },
        { name: 'VERITAS', repid: 8103, tier: 'DIAMOND' },
        { name: 'APM', repid: 6891, tier: 'GOLD' },
        { name: 'SOPHIA', repid: 7450, tier: 'GOLD' },
    ]);

    const [walletAddress, setWalletAddress] = useState<string | null>(null);

    const handleCreateWallet = async () => {
        // In a real app, this would call /api/brain/cdp/wallet
        setWalletAddress("0x8626...f71C");
    };

    const [recentTrades, setRecentTrades] = useState([
        { asset: 'BTC/USDC', direction: 'LONG', outcome: '+4.21 USDC', donor: 'GiveDirectly', drift: 'PASS (0.003)' },
        { asset: 'ETH/USDC', direction: 'SHORT', outcome: '+1.15 USDC', donor: 'Water.org', drift: 'PASS (0.012)' },
    ]);

    return (
        <div className="min-h-screen p-4 md:p-8 space-y-6">
            <header className="flex justify-between items-center">
                <h1 className="text-xl font-bold tracking-tight">TRINITY CRYPTO PROGNOSTICATOR</h1>
                <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    <span className="text-xs font-medium opacity-70">LIVE</span>
                </div>
            </header>

            {/* Agent Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {agents.map((agent) => (
                    <div key={agent.name} className="dashboard-card text-center space-y-2">
                        <h3 className="text-xs font-semibold opacity-60 tracking-widest">{agent.name}</h3>
                        <div className="text-2xl font-bold font-mono text-trust">{agent.repid.toLocaleString()}</div>
                        <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block ${agent.tier === 'DIAMOND' ? 'bg-blue-500/20 text-blue-400' : 'bg-yellow-500/20 text-yellow-400'
                            }`}>
                            {agent.tier}
                        </div>
                    </div>
                ))}
            </div>

            {/* Coinbase Wallet Section */}
            <section className="dashboard-card space-y-4">
                <div className="flex justify-between items-center">
                    <h2 className="text-sm font-bold opacity-60 uppercase tracking-wider">Agent Identity (CDP)</h2>
                    <img src="https://avatars.githubusercontent.com/u/18060233?s=200&v=4" alt="Coinbase" className="w-6 h-6 grayscale opacity-50" />
                </div>
                {!walletAddress ? (
                    <button
                        onClick={handleCreateWallet}
                        className="w-full py-3 bg-trust/10 border border-trust/30 text-trust rounded-md font-bold hover:bg-trust/20 transition-all text-xs"
                    >
                        INITIALIZE AGENT WALLET
                    </button>
                ) : (
                    <div className="flex justify-between items-center p-3 bg-black/40 rounded border border-white/10">
                        <div className="space-y-1">
                            <div className="text-[10px] opacity-40 uppercase">Base Sepolia Address</div>
                            <div className="text-sm font-mono">{walletAddress}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-[10px] text-trust font-bold">FUNDED</div>
                            <div className="text-xs font-bold">0.1 ETH</div>
                        </div>
                    </div>
                )}
            </section>

            {/* Live Decisions */}
            <section className="space-y-4">
                <h2 className="text-sm font-bold opacity-60 uppercase tracking-wider">Live Decisions</h2>
                <div className="space-y-3">
                    {recentTrades.map((trade, i) => (
                        <div key={i} className="dashboard-card flex justify-between items-center hover:border-gray-600 transition-colors pointer-cursor">
                            <div className="space-y-1">
                                <div className="text-sm font-bold">{trade.asset} <span className="text-success">{trade.direction}</span></div>
                                <div className="text-xs opacity-60">Drift: <span className="text-success">{trade.drift}</span> | {trade.donor}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-sm font-bold text-success">{trade.outcome}</div>
                                <button className="text-[10px] text-trust hover:underline">View Proof →</button>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Portfolio Stats */}
            <div className="dashboard-card flex justify-between items-end">
                <div>
                    <h2 className="text-xs font-bold opacity-60 uppercase tracking-wider mb-1">Portfolio Impact</h2>
                    <div className="text-3xl font-bold text-success">+12.47 USDC <span className="text-sm font-normal opacity-60 ml-1">Today</span></div>
                </div>
                <div className="text-right space-y-1">
                    <div className="text-[10px] font-bold opacity-60 uppercase">Sharpe Ratio</div>
                    <div className="text-lg font-bold font-mono">1.82</div>
                </div>
            </div>

            <footer className="pt-8 text-center text-[10px] opacity-40">
                VERIFIED ON BASE SEPOLIA & RECALL NETWORK
            </footer>
        </div>
    );
}
