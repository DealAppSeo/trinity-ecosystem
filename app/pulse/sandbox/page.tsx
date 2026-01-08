'use client';

import React, { useEffect, useState } from 'react';
import Card from '@/components/ui/Card';
import { Activity, Shield, Cpu, RefreshCw, Layers, Zap, Database, Palette } from 'lucide-react';

interface AgentState {
    id: string;
    agent_id: string;
    status: string;
    current_task: string | null;
    memory: any;
    updated_at: string;
}

export default function SandboxPage() {
    const [agents, setAgents] = useState<AgentState[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchAgents = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/sandbox/agents');
            const data = await res.json();
            if (data.agents) {
                // De-duplicate by agent_id
                const uniqueAgents = Object.values(
                    data.agents.reduce((acc: any, curr: AgentState) => {
                        if (!acc[curr.agent_id] || new Date(curr.updated_at) > new Date(acc[curr.agent_id].updated_at)) {
                            acc[curr.agent_id] = curr;
                        }
                        return acc;
                    }, {})
                ) as AgentState[];
                setAgents(uniqueAgents);
            }
        } catch (e) {
            console.error("Failed", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAgents();
        const interval = setInterval(fetchAgents, 5000); // Poll slow 5s
        return () => clearInterval(interval);
    }, []);

    const getAgentsByRole = (role: string) => agents.filter(a => a.agent_id.includes(role));
    const managers = agents.filter(a => a.agent_id.includes('MANAGER'));
    const grokPod = agents.filter(a => a.agent_id.includes('GROK'));
    const claudePod = agents.filter(a => a.agent_id.includes('CLAUDE'));
    const geminiPod = agents.filter(a => a.agent_id.includes('GEMINI'));

    return (
        <div className="min-h-screen bg-black text-white p-8 font-sans">
            <header className="mb-12 flex justify-between items-center border-b border-gray-800 pb-4">
                <div>
                    <h1 className="text-3xl font-light tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-600">
                        HYPERDAG SWARM <span className="text-xs ml-2 text-gray-500 font-mono">3x3+3 TOPOLOGY</span>
                    </h1>
                    <p className="text-gray-400 text-sm mt-1">
                        ZKP-Secured Multiplicative Intelligence
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-xs text-green-500 font-mono flex items-center gap-2">
                        <Shield size={12} /> ZKP REPUTATION ACTIVE
                    </span>
                    <button onClick={fetchAgents} className="p-2 rounded-full hover:bg-gray-800 transition-colors">
                        <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                    </button>
                </div>
            </header>

            {/* ORCHESTRATION LAYER */}
            <div className="mb-16">
                <h2 className="text-sm font-mono text-gray-500 mb-4 flex items-center gap-2">
                    <Layers size={14} /> ORCHESTRATION LAYER
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {managers.map(agent => <AgentCard key={agent.agent_id} agent={agent} color="gray" icon={<Layers />} />)}
                    {managers.length === 0 && <div className="text-gray-700 italic">Orchestrators Offline</div>}
                </div>
            </div>

            {/* EXECUTION PODS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* GROK POD */}
                <div>
                    <h2 className="text-sm font-mono text-blue-500 mb-4 flex items-center gap-2">
                        <Zap size={14} /> GROK_CMO POD (Market/Viral)
                    </h2>
                    <div className="space-y-4">
                        {grokPod.map(agent => <AgentCard key={agent.agent_id} agent={agent} color="blue" icon={<Zap />} />)}
                    </div>
                </div>

                {/* CLAUDE POD */}
                <div>
                    <h2 className="text-sm font-mono text-purple-500 mb-4 flex items-center gap-2">
                        <Palette size={14} /> CLAUDE_CDO POD (UI/Code)
                    </h2>
                    <div className="space-y-4">
                        {claudePod.map(agent => <AgentCard key={agent.agent_id} agent={agent} color="purple" icon={<Palette />} />)}
                    </div>
                </div>

                {/* GEMINI POD */}
                <div>
                    <h2 className="text-sm font-mono text-green-500 mb-4 flex items-center gap-2">
                        <Database size={14} /> GEMINI_CTO POD (Security)
                    </h2>
                    <div className="space-y-4">
                        {geminiPod.map(agent => <AgentCard key={agent.agent_id} agent={agent} color="green" icon={<Database />} />)}
                    </div>
                </div>
            </div>

        </div>
    );
}

function AgentCard({ agent, color, icon }: { agent: AgentState, color: string, icon: any }) {
    const colorClasses: Record<string, string> = {
        'blue': 'bg-blue-900/20 text-blue-400 border-blue-900/30',
        'purple': 'bg-purple-900/20 text-purple-400 border-purple-900/30',
        'green': 'bg-green-900/20 text-green-400 border-green-900/30',
        'gray': 'bg-gray-800/50 text-gray-300 border-gray-700',
    };

    return (
        <Card className={`border backdrop-blur-md bg-gray-900/40 border-gray-800`}>
            <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
                        {icon}
                    </div>
                    <div>
                        <h3 className="font-bold text-sm">{agent.agent_id}</h3>
                        <div className="flex items-center gap-2 text-[10px] text-gray-500 font-mono">
                            ZKP Verified • {agent.status}
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-2 text-xs bg-black/40 p-2 rounded">
                <p className="text-gray-400 mb-1">TASK:</p>
                <p className="text-gray-200 line-clamp-2">{agent.current_task || "IDLE"}</p>
            </div>
        </Card>
    );
}
