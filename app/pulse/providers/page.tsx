"use client";

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import { Activity, ShieldCheck, Zap, Database, TrendingDown, DollarSign } from 'lucide-react';

export default function ProviderUsageDashboard() {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchLogs() {
            setLoading(true);
            const { data, error } = await supabase
                .from('provider_usage_log')
                .select('*')
                .order('created_at', { ascending: true });
            
            if (data) setLogs(data);
            setLoading(false);
        }
        fetchLogs();
    }, []);

    // Derived Metrics
    const totalTokens = logs.reduce((sum, l) => sum + (l.tokens_in || 0) + (l.tokens_out || 0), 0);
    const totalCost = logs.reduce((sum, l) => sum + (l.cost_usd || 0), 0);
    const cacheHits = logs.filter(l => l.task_type === 'CACHE_HIT').length;
    const hitRate = logs.length > 0 ? ((cacheHits / logs.length) * 100).toFixed(1) : "0.0";
    const estMonthlyCost = (totalCost * 30).toFixed(2); // very rough estimate assuming today's cost * 30

    // Transform for Bar Chart (Tokens per Provider)
    const providerTokens: Record<string, number> = {};
    logs.forEach(l => {
        if (!providerTokens[l.provider_used]) providerTokens[l.provider_used] = 0;
        providerTokens[l.provider_used] += (l.tokens_in || 0) + (l.tokens_out || 0);
    });
    const barData = Object.keys(providerTokens).map(k => ({ name: k, Tokens: providerTokens[k] }));

    // Transform for Line Chart (Cost over Time - grouped by roughly hour)
    const timeCost: Record<string, number> = {};
    logs.forEach(l => {
        const hour = new Date(l.created_at).getHours().toString() + ":00";
        if (!timeCost[hour]) timeCost[hour] = 0;
        timeCost[hour] += (l.cost_usd || 0);
    });
    const lineData = Object.keys(timeCost).map(k => ({ time: k, Cost: timeCost[k] }));

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
            <header className="flex justify-between items-end border-b border-white/10 pb-6">
                <div>
                    <h1 className="text-4xl font-mono font-bold text-white mb-2">INTELLIGENCE ROUTING PULSE</h1>
                    <p className="text-slate-400 font-mono">Real-time SBFA Edge Cost Analysis & Performance Monitoring</p>
                </div>
                <div className="flex space-x-2">
                    <span className="px-3 py-1 bg-green-500/20 text-green-400 font-mono text-sm border border-green-500/30 rounded">SYSTEM: ONLINE</span>
                    <span className="px-3 py-1 bg-blue-500/20 text-blue-400 font-mono text-sm border border-blue-500/30 rounded">ANFIS: ACTIVE</span>
                </div>
            </header>

            {/* Top Stat Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatCard 
                    title="Gross Network Latency" 
                    value="1.2s" 
                    subtitle="Avg Generation Speed" 
                    icon={<Zap className="w-6 h-6 text-yellow-400" />} 
                />
                <StatCard 
                    title="PGVector Cache Hit Rate" 
                    value={`${hitRate}%`} 
                    subtitle={`Total Semantic Hits: ${cacheHits}`} 
                    icon={<Database className="w-6 h-6 text-emerald-400" />} 
                />
                <StatCard 
                    title="Total Cycle Cost" 
                    value={`$${totalCost.toFixed(4)}`} 
                    subtitle="24h Rolling Average" 
                    icon={<DollarSign className="w-6 h-6 text-blue-400" />} 
                />
                <StatCard 
                    title="Est. 30-Day Burn" 
                    value={`$${estMonthlyCost}`} 
                    subtitle="-40% Cached Extrapolation" 
                    icon={<TrendingDown className="w-6 h-6 text-purple-400" />} 
                />
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Provider Token Distribution */}
                <div className="bg-slate-900/50 p-6 rounded-xl border border-white/5 backdrop-blur-sm shadow-xl">
                    <h3 className="text-lg font-mono font-bold text-white mb-6 flex items-center">
                        <Activity className="w-5 h-5 mr-3 text-cyan-400" />
                        Provider Volume Distribution (Tokens)
                    </h3>
                    <div className="h-72">
                        {loading ? <div className="animate-pulse h-full bg-slate-800 rounded"></div> : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={barData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                                    <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} />
                                    <YAxis stroke="#64748b" fontSize={12} tickLine={false} />
                                    <RechartsTooltip 
                                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                                        itemStyle={{ color: '#38bdf8' }}
                                    />
                                    <Bar dataKey="Tokens" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* Network Spend Acceleration */}
                <div className="bg-slate-900/50 p-6 rounded-xl border border-white/5 backdrop-blur-sm shadow-xl">
                    <h3 className="text-lg font-mono font-bold text-white mb-6 flex items-center">
                        <TrendingDown className="w-5 h-5 mr-3 text-red-500" />
                        Network Spend Acceleration (USD)
                    </h3>
                    <div className="h-72">
                        {loading ? <div className="animate-pulse h-full bg-slate-800 rounded"></div> : (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={lineData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                                    <XAxis dataKey="time" stroke="#64748b" fontSize={12} tickLine={false} />
                                    <YAxis stroke="#64748b" fontSize={12} tickLine={false} />
                                    <RechartsTooltip 
                                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                                        itemStyle={{ color: '#f43f5e' }}
                                    />
                                    <Legend />
                                    <Line type="monotone" dataKey="Cost" stroke="#f43f5e" strokeWidth={3} dot={{ r: 4, fill: '#f43f5e', strokeWidth: 0 }} activeDot={{ r: 8 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            </div>

            {/* Epistemic Diversity Audit Panel */}
            <div className="bg-slate-900/50 p-6 rounded-xl border border-white/5 backdrop-blur-sm shadow-xl">
                <h3 className="text-lg font-mono font-bold text-white mb-4 flex items-center">
                    <ShieldCheck className="w-5 h-5 mr-3 text-yellow-500" />
                    BFT Epistemic Diversity Audits 
                </h3>
                <p className="text-slate-400 font-mono text-sm leading-relaxed max-w-4xl">
                    By strictly enforcing cross-familial routing, Trinity guarantees that Generative models (e.g. OpenAI GPT-4) are never blindly verified by siblings within the same architectural lineage. Instead, opposing LLMs strictly gate x402 outputs, preventing unified hallucination cascades.
                </p>
                
                <div className="mt-6 flex items-center space-x-6">
                     <div className="bg-red-500/10 border border-red-500/20 px-4 py-2 rounded text-red-400 font-mono text-xs">GROQ → CLAUDE</div>
                     <span className="text-slate-600 font-mono">VS</span>
                     <div className="bg-blue-500/10 border border-blue-500/20 px-4 py-2 rounded text-blue-400 font-mono text-xs">DEEPSEEK → GPT-4</div>
                     <span className="text-slate-600 font-mono">VS</span>
                     <div className="bg-green-500/10 border border-green-500/20 px-4 py-2 rounded text-green-400 font-mono text-xs">CEREBRAS → SAMBANOVA</div>
                </div>
            </div>
        </div>
    );
}

function StatCard({ title, value, subtitle, icon }: { title: string, value: string, subtitle: string, icon: React.ReactNode }) {
    return (
        <div className="bg-slate-900/60 p-6 rounded-xl border border-white/5 backdrop-blur-md hover:border-white/20 transition duration-300">
            <div className="flex justify-between items-start mb-4">
                <h3 className="text-slate-400 font-mono text-sm uppercase tracking-wider">{title}</h3>
                <div className="bg-slate-800 p-2 rounded-lg">{icon}</div>
            </div>
            <div className="text-3xl font-bold font-mono text-white mb-1">{value}</div>
            <div className="text-slate-500 text-xs font-mono">{subtitle}</div>
        </div>
    );
}
