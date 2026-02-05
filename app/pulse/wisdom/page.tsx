"use client";

export const dynamic = 'force-dynamic';

import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';
import { useTrinityController } from '@/hooks/useTrinityController'; // Added hook
import { Card } from '@/components/ui/Card';
import {
    BrainCircuit,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Activity,
    Zap,
    ShieldCheck
} from 'lucide-react';
import { Toaster, toast } from 'sonner';

// Client reused from lib/supabase (mock-safe)

// Interface mostly covered by hook, but keeping local extends if needed or just use hook type
interface AgentRecord {
    id: string;
    agent_name: string;
    system_prompt: string | null;
    current_tier: string;
    reputation_score: number;
    tasks_completed: number;
    // New ANFIS Columns
    directive_source: 'human' | 'anfis_suggested' | 'fallback';
    suggested_prompt?: string;
    suggestion_confidence?: number;
    suggestion_accepted?: boolean;
    updated_at?: string;
    status?: string;
    group_name?: string;
}

export default function WisdomPage() {
    // UNIFIED CONTROLLER HOOK
    const { agents: rawAgents, loading, systemStatus, refresh } = useTrinityController();

    // Cast to local type if needed, or better yet, just use the hook's returned agents.
    // The hook returns 'Active' status correctly calculated via heartbeat.
    const agents = rawAgents as unknown as AgentRecord[];

    const [processingId, setProcessingId] = useState<string | null>(null);

    // Brain status now comes from hook
    const brainStatus = systemStatus?.pyBrain ? 'online' : 'offline';

    // Agent Grouping Logic (Standardized via hook)
    const groups = ['ORCHESTRATION', 'ALPHA', 'BETA', 'GAMMA', 'Operatives'];

    // Benchmark Data
    const [benchmarks, setBenchmarks] = useState<any[]>([]);
    const fetchBenchmarks = async () => {
        const { data } = await supabase
            .from('trinity_tasks')
            .select('*')
            //.eq('metadata->benchmark', 'true') // syntax depends on supabase js version/setup
            .ilike('title', '%[BENCHMARK-%')
            .order('created_at', { ascending: false })
            .limit(5);
        if (data) setBenchmarks(data);
    };

    useEffect(() => {
        fetchBenchmarks();

        // Listen for task changes to update benchmarks
        const taskChannel = supabase
            .channel('public:trinity_tasks_benchmarks')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'trinity_tasks' }, (payload: any) => {
                console.log('Real-time Benchmark Update:', payload);
                fetchBenchmarks();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(taskChannel);
        };
    }, []);

    // Actions
    const handleAccept = async (agent: AgentRecord) => {
        if (!agent.suggested_prompt || processingId) return;
        setProcessingId(agent.agent_name);

        const baseUrl = process.env.NEXT_PUBLIC_TRINITY_SCIENCE_URL || 'http://localhost:8000';
        const promise = fetch(`${baseUrl}/anfis/v2/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agent_id: agent.agent_name })
        }).then(async (res) => {
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || err.error);
            }
            return res.json();
        });

        toast.promise(promise, {
            loading: 'Integrating Wisdom into Neural Network...',
            success: (data) => {
                refresh(); // Refresh global state
                setProcessingId(null);
                return `Wisdom Integrated: ${agent.agent_name} Updated!`;
            },
            error: (err) => {
                setProcessingId(null);
                return `Integration Failed: ${err.message}`;
            }
        });
    };

    const handleReject = async (agent: AgentRecord) => {
        if (processingId) return;
        setProcessingId(agent.agent_name);

        const baseUrl = process.env.NEXT_PUBLIC_TRINITY_SCIENCE_URL || 'http://localhost:8000';
        const promise = fetch(`${baseUrl}/anfis/v2/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agent_id: agent.agent_name })
        }).then(async (res) => {
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || err.error);
            }
            return res.json();
        });

        toast.promise(promise, {
            loading: 'Discarding Suggestion...',
            success: () => {
                refresh(); // Refresh global state
                setProcessingId(null);
                return 'Suggestion Rejected';
            },
            error: (err) => {
                setProcessingId(null);
                return `Error: ${err.message}`;
            }
        });
    };

    // Metrics Calculation
    const totalRep = agents.reduce((acc, curr) => acc + (curr.reputation_score || 0), 0);
    const avgRep = agents.length ? (totalRep / agents.length).toFixed(1) : '0';
    const suggestionsPending = agents.filter(a => a.suggested_prompt).length;
    const anfisActiveCount = agents.filter(a => a.directive_source === 'human').length;

    // Training Stats Logic
    const [trainingStats, setTrainingStats] = useState<any[]>([]);

    // Fetch stats from the new SQL View
    const fetchTrainingStats = async () => {
        const { data, error } = await supabase
            .from('view_agent_performance') // Fetches from the view we just created
            .select('*');

        if (error) console.error('Error fetching training stats:', error);
        if (data) setTrainingStats(data);
    };

    useEffect(() => {
        fetchTrainingStats();
        const interval = setInterval(fetchTrainingStats, 10000); // Update every 10s
        return () => clearInterval(interval);
    }, []);

    // Helper to get stats for a specific benchmark type
    const getBenchmarkStat = (type: string) => {
        // Find stats for this benchmark type
        // In verify-view, we group by agent_name, benchmark_type.
        // For the summary table, we might want the *best* agent or an average of all.
        // Let's filter by type first.
        const typeStats = trainingStats.filter(s => s.benchmark_type && s.benchmark_type.includes(type));

        if (typeStats.length === 0) return null;

        // Find top performer
        const topAgent = typeStats.reduce((prev, current) => (prev.avg_score > current.avg_score) ? prev : current);

        // Calculate total average across all agents for this type
        const totalAvg = typeStats.reduce((acc, curr) => acc + curr.avg_score, 0) / typeStats.length;

        return {
            topAgent: topAgent.agent_name,
            avgScore: totalAvg,
            attempts: typeStats.reduce((acc, curr) => acc + curr.attempts, 0)
        };
    };

    return (
        <div className="p-6 space-y-8 min-h-screen bg-gradient-to-br from-gray-900 to-black text-white">
            {/* Header consolidated into root NavBar */}
            <div className="flex justify-end gap-4 p-2 bg-white/5 rounded-lg border border-white/10">
                <div className="text-right">
                    <div className="text-lg font-mono text-green-400">{avgRep}</div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-tighter">Avg Rep</div>
                </div>
                <div className="w-px h-8 bg-white/10" />
                <div className="text-right">
                    <div className={`text-lg font-mono ${brainStatus === 'online' ? 'text-green-400' : 'text-red-500'}`}>
                        {brainStatus === 'online' ? 'ON' : 'OFF'}
                    </div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-tighter">Py-Brain</div>
                </div>
            </div>

            {/* Notifications */}
            <Toaster richColors position="top-right" theme="dark" />

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border-blue-500/30 bg-blue-500/5">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-full bg-blue-500/20 text-blue-400">
                            <Activity className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold">{agents.filter(a => ['active', 'online', 'green', 'blue', 'amber'].includes(a.status || '')).length}</div>
                            <div className="text-xs text-blue-200">Active Agents</div>
                        </div>
                    </div>
                </Card>
                <Card className="border-purple-500/30 bg-purple-500/5">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-full bg-purple-500/20 text-purple-400">
                            <Zap className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold">{suggestionsPending}</div>
                            <div className="text-xs text-purple-200">Pending Suggestions</div>
                        </div>
                    </div>
                </Card>
                <Card className="border-green-500/30 bg-green-500/5">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-full bg-green-500/20 text-green-400">
                            <ShieldCheck className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold">{anfisActiveCount}</div>
                            <div className="text-xs text-green-200">Human-Verified Directives</div>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Training Grounds (Benchmarks) */}
            {/* Training Grounds (Benchmarks) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {['GAIA', 'WebArena', 'SWE-Bench', 'Debate', 'Impact'].map(type => {
                    const task = benchmarks.find(b => b.title.includes(type.toUpperCase()) || b.title.includes(type));
                    const status = task ? task.status : 'pending';
                    const isComplete = status === 'completed';
                    const isInProgress = status === 'in_progress';

                    return (
                        <div key={type} className={`border p-4 rounded transition-all duration-500 ${isComplete ? 'bg-green-500/10 border-green-500/50' : isInProgress ? 'bg-yellow-500/10 border-yellow-500/50' : 'bg-white/5 border-white/10'}`}>
                            <div className="text-xs text-gray-500 uppercase font-bold mb-1 flex justify-between">
                                <span>
                                    {type === 'Impact' ? '❤️ ' : type === 'Debate' ? '🗣️ ' : type === 'SWE-Bench' ? '💻 ' : type === 'WebArena' ? '🌐 ' : '🧠 '}
                                    {type}
                                </span>
                                {isComplete && <CheckCircle2 className="w-3 h-3 text-green-400" />}
                            </div>
                            <div className="flex items-center justify-between mt-2">
                                <div className={`text-sm font-mono ${isComplete ? 'text-green-400' : isInProgress ? 'text-yellow-400' : 'text-gray-400'}`}>
                                    {status === 'pending' ? 'WAITING' : status.toUpperCase().replace('_', ' ')}
                                </div>
                                {isInProgress && <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></div>}
                            </div>
                            {task && task.claimed_by && (
                                <div className="text-[10px] text-gray-500 mt-1 truncate">
                                    Agent: {task.claimed_by.replace('trinity-', '')}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Suggestion Inbox (The Governance Core) */}
            <div className="space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-500" />
                    Pending ANFIS Optimizations
                </h2>

                {suggestionsPending === 0 ? (
                    <div className="p-8 border border-dashed border-white/10 rounded-lg text-center text-gray-500">
                        No pending suggestions. The fleet is aligned.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        {agents.filter(a => a.suggested_prompt).map(agent => (
                            <div key={agent.agent_name} className="bg-white/5 border border-yellow-500/30 rounded-lg p-6 flex flex-col md:flex-row gap-6">
                                <div className="flex-1 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-lg font-bold text-yellow-400">{agent.agent_name}</h3>
                                        <span className="text-xs bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded">
                                            Confidence: {(agent.suggestion_confidence || 0) * 100}%
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                                        <div className="bg-black/30 p-3 rounded border border-white/5 opacity-50">
                                            <div className="mb-1 text-gray-500">CURRENT</div>
                                            {agent.system_prompt || "Default Persona"}
                                        </div>
                                        <div className="bg-black/30 p-3 rounded border border-yellow-500/20 text-yellow-100">
                                            <div className="mb-1 text-yellow-500 font-bold">SUGGESTION</div>
                                            {agent.suggested_prompt}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col justify-center gap-2 min-w-[120px]">
                                    <button
                                        onClick={() => handleAccept(agent)}
                                        className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white py-2 px-4 rounded transition-colors"
                                    >
                                        <CheckCircle2 className="w-4 h-4" /> Accept
                                    </button>
                                    <button
                                        onClick={() => handleReject(agent)}
                                        className="flex items-center justify-center gap-2 bg-red-900/50 hover:bg-red-900 text-red-200 py-2 px-4 rounded transition-colors"
                                    >
                                        <XCircle className="w-4 h-4" /> Reject
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Live Truth Heatmap (Fleet Overview - Grouped) */}
            <div className="space-y-8 pb-12">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Activity className="w-5 h-5 text-blue-400" />
                    Fleet Wisdom State
                </h2>

                {groups.map(group => {
                    const groupAgents = agents.filter(a => (a.group_name || 'Operatives') === group);
                    if (groupAgents.length === 0) return null;

                    return (
                        <div key={group} className="space-y-3">
                            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2 bg-white/5 p-2 rounded w-fit">
                                <span className={`w-2 h-2 rounded-full ${group === 'ORCHESTRATION' ? 'bg-purple-400' : 'bg-blue-400'}`}></span>
                                {group}
                            </h2>
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                {groupAgents.map(agent => (
                                    <div key={agent.agent_name} className="bg-white/5 p-3 rounded border border-white/5 hover:border-blue-400/50 transition-colors relative group">
                                        <div className="flex justify-between items-center mb-2">
                                            <div className="text-sm font-bold truncate flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full ${['active', 'online', 'green', 'blue', 'amber'].includes(agent.status || '') ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse' : 'bg-gray-600'}`}></div>
                                                {agent.agent_name.replace('trinity-', '')}
                                            </div>
                                            <div className="text-[10px] text-gray-500">
                                                {(agent.status || 'offline').toUpperCase()}
                                            </div>
                                        </div>
                                        <div className="flex items-end gap-2">
                                            <div className="h-1 bg-gray-700 w-full rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full transition-all duration-500 ${agent.reputation_score > 80 ? 'bg-blue-400' : 'bg-white/50'}`}
                                                    style={{ width: `${Math.max(5, Math.min(100, agent.reputation_score))}%` }}
                                                />
                                            </div>
                                            <div className="text-xs font-mono text-gray-400">{agent.reputation_score}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Training Summary Table (Benchmarks) */}
            <div className="space-y-4 pb-12">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                    <BrainCircuit className="w-5 h-5 text-purple-400" />
                    Training Performance
                </h2>
                <div className="overflow-x-auto bg-white/5 rounded-lg border border-white/10">
                    <table className="w-full text-left text-sm text-gray-400">
                        <thead className="bg-black/20 text-gray-200 uppercase font-mono text-xs">
                            <tr>
                                <th className="p-4">Benchmark</th>
                                <th className="p-4">Top Agent</th>
                                <th className="p-4 text-center">Avg Score</th>
                                <th className="p-4 text-right">Trend / Attempts</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {['GAIA', 'WebArena', 'SWE-Bench', 'Debate', 'Impact'].map(type => {
                                const stat = getBenchmarkStat(type);

                                return (
                                    <tr key={type} className="hover:bg-white/5 transition-colors">
                                        <td className="p-4 font-bold text-white">{type}</td>
                                        <td className="p-4 font-mono text-blue-300">
                                            {stat ? stat.topAgent.replace('trinity-', '') : '-'}
                                        </td>
                                        <td className="p-4 text-center">
                                            <div className={`inline-block px-2 py-0.5 rounded font-mono ${stat ? 'bg-green-500/20 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                                                {stat ? (stat.avgScore * 100).toFixed(0) + '%' : 'N/A'}
                                            </div>
                                        </td>
                                        <td className="p-4 text-right text-xs font-mono text-gray-400">
                                            {stat ? `${stat.attempts} runs` : 'No data'}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
