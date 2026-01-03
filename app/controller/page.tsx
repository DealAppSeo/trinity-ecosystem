'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTrinityController } from '@/hooks/useTrinityController';
import { supabase } from '@/lib/supabase';
import { AgentRegistryRecord, Task } from '@/lib/agent/types';
import { AGENT_GROUPS } from '@/lib/agent/groups';
import { Activity, Shield, Cpu, RefreshCw, PlusCircle, CheckCircle, AlertCircle, Users, Zap, Skull, ServerCrash, Share2, Lock } from 'lucide-react';
import Link from 'next/link';

function ControllerContent() {
    const searchParams = useSearchParams();
    const isViewMode = searchParams.get('mode') === 'view';

    const { agents, tasks, loading, createTask, refresh, killRandomAgent, triggerChaosEvent } = useTrinityController();
    const [newTaskTitle, setNewTaskTitle] = useState('');

    const handleCreateTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isViewMode) {
            alert('🔒 ACCESS DENIED: This feature is available for stakeholders only.');
            return;
        }
        if (!newTaskTitle.trim()) return;
        await createTask(newTaskTitle);
        setNewTaskTitle('');
    };

    const handleProtectedAction = (action: () => void, warning: string) => {
        if (isViewMode) {
            alert('🔒 ACCESS DENIED: This feature is available for stakeholders only.\n\nContact us for a live demo with full administrative privileges.');
            return;
        }
        if (confirm(warning)) {
            action();
        }
    };

    return (
        <div className="min-h-screen bg-black text-white p-4 md:p-6 font-mono">
            {/* Header */}
            <header className="flex flex-col md:flex-row justify-between items-center mb-8 border-b border-gray-800 pb-4 gap-4">
                <div className="flex items-center gap-3">
                    <Activity className="text-blue-500 w-8 h-8" />
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                            AI Trinity Controller
                            {isViewMode && <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded border border-gray-700 flex items-center gap-1"><Lock className="w-3 h-3" /> VIEW ONLY</span>}
                            {!isViewMode && <span className="text-xs bg-blue-900 text-blue-300 px-2 py-1 rounded ml-2">ADMIN</span>}
                        </h1>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {isViewMode && (
                        <Link href="/" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded uppercase tracking-wider transition-colors">
                            Request Access
                        </Link>
                    )}
                    <button onClick={refresh} className="p-2 hover:bg-gray-800 rounded-full transition-colors">
                        <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </header>

            {/* Chaos Control & Status Panel */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {/* Chaos Testing */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-red-900/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="flex items-center gap-3 mb-4 relative z-10">
                        <Skull className="w-6 h-6 text-red-500" />
                        <div>
                            <h2 className="text-lg font-semibold text-zinc-100">Chaos Testing</h2>
                            <p className="text-zinc-500 text-xs">Anti-fragility simulation</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 relative z-10">
                        <button
                            onClick={() => handleProtectedAction(
                                killRandomAgent,
                                '⚠️ WARNING: This will immediately take a random agent OFFLINE. Continue?'
                            )}
                            className={`px-4 py-3 rounded-lg text-sm border transition-all flex flex-col items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 duration-200
                                ${isViewMode
                                    ? 'bg-zinc-800/50 text-zinc-500 border-zinc-700/50 cursor-not-allowed hover:bg-red-900/20 hover:text-red-400 hover:border-red-900/50'
                                    : 'bg-red-950 hover:bg-red-900/80 text-red-200 border-red-900/50'
                                }`}
                        >
                            <Skull className="w-5 h-5" />
                            <span>Kill Agent</span>
                        </button>
                        <button
                            onClick={() => handleProtectedAction(
                                () => triggerChaosEvent('Network Partition'),
                                '⚠️ WARNING: Simulate Network Partition? This may disrupt all tasks.'
                            )}
                            className={`px-4 py-3 rounded-lg text-sm border transition-all flex flex-col items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 duration-200
                                ${isViewMode
                                    ? 'bg-zinc-800/50 text-zinc-500 border-zinc-700/50 cursor-not-allowed hover:bg-orange-900/20 hover:text-orange-400 hover:border-orange-900/50'
                                    : 'bg-orange-950 hover:bg-orange-900/80 text-orange-200 border-orange-900/50'
                                }`}
                        >
                            <ServerCrash className="w-5 h-5" />
                            <span>Sever DB</span>
                        </button>
                    </div>
                </div>

                {/* 3x3 Squad Status */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 relative group">
                    <div className="flex items-center gap-3 mb-4">
                        <Share2 className="w-6 h-6 text-blue-500" />
                        <div>
                            <h2 className="text-lg font-semibold text-zinc-100">3x3 Squad Status</h2>
                            <p className="text-zinc-500 text-xs">Active Trinity Formations</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        {Object.values(AGENT_GROUPS).map(group => {
                            const lead = agents.find(a => a.agent_name === group.leadAgent);
                            const isOnline = lead?.status === 'active';

                            return (
                                <div key={group.id} className={`p-3 rounded-lg border text-center transition-colors ${isOnline ? 'bg-black/40 border-zinc-800/50 hover:border-blue-500/30' : 'bg-red-900/10 border-red-900/50'}`}>
                                    <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">{group.name.split(' ')[0]}</div>
                                    <div className={`text-xs font-mono flex items-center justify-center gap-1 ${isOnline ? 'text-green-400' : 'text-red-400'}`}>
                                        <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                                        {isOnline ? 'ONLINE' : 'OFFLINE'}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* 🤖 AGENT GRID */}
                <section className="lg:col-span-2 space-y-6">
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                        <Cpu className="w-5 h-5 text-purple-400" /> Active Agents
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {agents.map((agent) => (
                            <div key={agent.agent_name} className="bg-gray-900 border border-gray-800 p-4 rounded-lg hover:border-blue-500 transition-colors">
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="font-bold text-lg">{agent.agent_name}</h3>
                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${agent.current_tier === 'Act' ? 'bg-green-900 text-green-300' :
                                        agent.current_tier === 'Approve' ? 'bg-yellow-900 text-yellow-300' :
                                            'bg-gray-700 text-gray-300'
                                        }`}>
                                        {agent.current_tier}
                                    </span>
                                </div>
                                <div className="flex items-center gap-4 text-sm text-gray-400">
                                    <div className="flex items-center gap-1">
                                        <Shield className="w-4 h-4 text-blue-400" />
                                        <span>Rep: {agent.reputation_score}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <CheckCircle className="w-4 h-4 text-green-400" />
                                        <span>Tasks: {agent.tasks_completed}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {agents.length === 0 && !loading && (
                            <div className="col-span-2 text-center text-gray-500 py-8 border border-dashed border-gray-800 rounded">
                                No agents registered yet. Run verify-repid.ts to initialize VERITAS.
                            </div>
                        )}
                    </div>
                </section>

                {/* 📋 TASK FEED */}
                <section className="space-y-6">
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 text-yellow-400" /> Mission Control
                    </h2>

                    {/* New Task Form */}
                    <form onSubmit={handleCreateTask} className="flex gap-2">
                        <input
                            type="text"
                            value={newTaskTitle}
                            onChange={(e) => setNewTaskTitle(e.target.value)}
                            placeholder={isViewMode ? "🔒 View Only Mode" : "Delegate a task..."}
                            disabled={isViewMode} // Optional: Keep disabled but interactive if desired, but standard pattern is disabling input. User asked for "seen... but perhaps on mouse over it tells them".
                            // Let's keep it enabled but block submit to allow the "click + alert" flow the user asked for?
                            // Actually, standard HTML disabled prevents events. Let's make it look disabled but actually work for the alert.
                            // Re-enabling and styling to look disabled is safer for the "click to see why" pattern.
                            className={`flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 ${isViewMode ? 'opacity-50 cursor-not-allowed' : ''}`}
                        />
                        <button type="submit" className={`bg-blue-600 hover:bg-blue-700 text-white p-2 rounded transition-colors ${isViewMode ? 'opacity-50' : ''}`}>
                            <PlusCircle className="w-5 h-5" />
                        </button>
                    </form>

                    {/* Task List */}
                    <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                        {tasks.map((task) => (
                            <div key={task.id} className="bg-gray-900/50 border-l-2 border-gray-700 p-3 rounded-r text-sm">
                                <div className="font-medium text-gray-200">{task.title}</div>
                                <div className="flex justify-between mt-2 text-xs text-gray-500">
                                    <span className="uppercase">{task.status}</span>
                                    <span>{new Date(task.created_at).toLocaleTimeString()}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}

export default function ControllerPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-black text-white p-6 flex justify-center items-center">Loading Controller...</div>}>
            <ControllerContent />
        </Suspense>
    );
}
