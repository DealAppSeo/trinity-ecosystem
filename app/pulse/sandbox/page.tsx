'use client';

import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Activity, Shield, Cpu, RefreshCw, Layers, Zap, Database, Palette } from 'lucide-react';

interface AgentState {
    id: string;
    agent_id: string;
    status: string;
    current_task: string | null;
    memory: any;
    updated_at: string;
}

import { useTrinityController } from '@/hooks/useTrinityController';

export default function SandboxPage() {
    // Use the central Realtime hook
    const { agents: registryAgents, loading } = useTrinityController();
    const [agents, setAgents] = useState<AgentState[]>([]);

    useEffect(() => {
        // Map AgentRegistryRecord to AgentState
        if (registryAgents) {
            const mappedAgents: AgentState[] = registryAgents.map(a => ({
                id: a.id || a.agent_name, // Fallback to name if id is missing
                agent_id: a.agent_name,
                status: a.status,
                current_task: (a as any).current_task_summary || (a.currentTask ? a.currentTask.title : null),
                memory: {},
                updated_at: a.lastHeartbeat || a.last_active || new Date().toISOString()
            }));
            setAgents(mappedAgents);
        }
    }, [registryAgents]);

    const normalize = (id: string) => id.toLowerCase();

    const managers = agents.filter(a => {
        const id = normalize(a.agent_id);
        return id === 'trinity-orch' || id === 'orch' || id.includes('w3c') || id.includes('shofet') || id.includes('mcp');
    });

    const grokPod = agents.filter(a => {
        const id = normalize(a.agent_id);
        return id === 'trinity-gcm' || id === 'gcm' || id === 'trinity-torch' || id === 'torch' || id === 'trinity-veritas' || id === 'veritas';
    });

    const claudePod = agents.filter(a => {
        const id = normalize(a.agent_id);
        return id === 'trinity-mel' || id === 'mel' || id === 'trinity-chesed' || id === 'chesed' || id === 'trinity-apm' || id === 'apm';
    });

    const geminiPod = agents.filter(a => {
        const id = normalize(a.agent_id);
        return id === 'trinity-hdm' || id === 'hdm' || id === 'trinity-nexus' || id === 'nexus' || id === 'trinity-sophia' || id === 'sophia';
    });

    return (
        <div className="min-h-screen bg-black text-white p-8 font-sans">
            {/* Header consolidated into root NavBar */}

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
