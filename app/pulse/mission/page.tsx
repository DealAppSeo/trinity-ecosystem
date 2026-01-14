'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Rocket, Target, Users, DollarSign, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTrinityController } from '@/hooks/useTrinityController'; // Trigger refresh on success
import { useToast } from '@/components/ui/Toast';

export default function NewMissionPage() {
    const router = useRouter();
    const { refresh } = useTrinityController();
    const { showToast } = useToast(); // Global Feedback Hook

    const [formData, setFormData] = useState({
        name: '',
        objective: '',
        swarmSize: 3,
        budget: 1000,
        priority: 'medium',
    });
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        // Haptic Feedback (Start)
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(50);

        try {
            // Map priority string to integer
            const priorityMap: Record<string, number> = { 'low': 2, 'medium': 5, 'high': 8 };
            const priorityInt = priorityMap[formData.priority] || 5;

            // Create high-level task representing the mission
            const configSummary = `\n\n[Mission Config]\nSwarm Size: ${formData.swarmSize}\nBudget: $${formData.budget}\nType: mission_deployment`;

            const { data, error } = await supabase
                .from('trinity_tasks')
                .insert([{
                    title: formData.name,
                    description: formData.objective + configSummary,
                    priority: priorityInt,
                    status: 'pending',
                    task_type: 'mission',
                    created_at: new Date().toISOString()
                }])
                .select()
                .single();

            if (error) throw error;

            // Log activity
            await supabase.from('trinity_agent_logs').insert([{
                agent_name: 'System',
                log_level: 'info',
                message: `Mission Deployed: ${formData.name}`,
                created_at: new Date().toISOString()
            }]);

            refresh();

            // UX Enhancement: Toast + Delay + Redirect
            showToast('Mission Deployed Successfully! Swarm Activating...', 'success');

            setTimeout(() => {
                router.push('/pulse/tasks');
            }, 1500);

        } catch (error: any) {
            console.error('Error deploying mission:', error);
            showToast(`Failed to deploy: ${error.message || 'Unknown Error'}`, 'error');
            // Haptic Error
            if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([50, 50, 50]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500 pb-10">
            {/* Header */}
            <div className="glass rounded-xl p-6 border border-violet-500/30 glow-violet">
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
                        <Rocket className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-white">Deploy New Mission</h2>
                        <p className="text-sm text-gray-400">Configure and launch an autonomous swarm objective</p>
                    </div>
                </div>
            </div>

            {/* Mission Configuration Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Mission Name */}
                <div className="glass rounded-xl p-6 border border-white/10">
                    <div className="flex items-center gap-3 mb-4">
                        <Target className="w-5 h-5 text-violet-400" />
                        <h3 className="font-bold text-white">Mission Name</h3>
                    </div>
                    <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g., Q1 Growth Strategy, API Integration Sprint"
                        className="w-full px-4 py-3 glass-light rounded-lg border border-white/10 focus:border-violet-500/50 outline-none transition-colors text-white placeholder-gray-500 bg-transparent"
                    />
                </div>

                {/* Objective */}
                <div className="glass rounded-xl p-6 border border-white/10">
                    <div className="flex items-center gap-3 mb-4">
                        <AlertTriangle className="w-5 h-5 text-cyan-400" />
                        <h3 className="font-bold text-white">Mission Objective</h3>
                    </div>
                    <textarea
                        required
                        value={formData.objective}
                        onChange={(e) => setFormData({ ...formData, objective: e.target.value })}
                        placeholder="Describe the mission objective in detail..."
                        rows={4}
                        className="w-full px-4 py-3 glass-light rounded-lg border border-white/10 focus:border-violet-500/50 outline-none transition-colors text-white placeholder-gray-500 resize-none bg-transparent"
                    />
                    <p className="text-xs text-gray-500 mt-2">
                        Be specific about goals, deliverables, and success criteria
                    </p>
                </div>

                {/* Swarm Configuration */}
                <div className="glass rounded-xl p-6 border border-white/10">
                    <div className="flex items-center gap-3 mb-6">
                        <Users className="w-5 h-5 text-violet-400" />
                        <h3 className="font-bold text-white">Swarm Configuration</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Swarm Size */}
                        <div>
                            <label className="block text-sm text-gray-400 mb-3">
                                Swarm Size (Agents)
                            </label>
                            <div className="flex items-center gap-4">
                                <input
                                    type="range"
                                    min="1"
                                    max="20"
                                    value={formData.swarmSize}
                                    onChange={(e) => setFormData({ ...formData, swarmSize: parseInt(e.target.value) })}
                                    className="flex-1 h-2 glass-light rounded-lg appearance-none cursor-pointer accent-violet-500"
                                    style={{
                                        background: `linear-gradient(to right, rgb(168 85 247) 0%, rgb(168 85 247) ${(formData.swarmSize / 20) * 100
                                            }%, rgba(255,255,255,0.1) ${(formData.swarmSize / 20) * 100}%, rgba(255,255,255,0.1) 100%)`,
                                    }}
                                />
                                <div className="w-16 px-3 py-2 glass-light rounded-lg text-center font-bold text-violet-400 border border-violet-500/20">
                                    {formData.swarmSize}
                                </div>
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                                More agents = faster execution, higher cost
                            </p>
                        </div>

                        {/* Priority */}
                        <div>
                            <label className="block text-sm text-gray-400 mb-3">Priority Level</label>
                            <div className="grid grid-cols-3 gap-2">
                                {['low', 'medium', 'high'].map((priority) => (
                                    <button
                                        key={priority}
                                        type="button"
                                        onClick={() => setFormData({ ...formData, priority })}
                                        className={`px-4 py-2 rounded-lg capitalize transition-all duration-200 font-medium ${formData.priority === priority
                                            ? priority === 'high'
                                                ? 'bg-red-500/20 border border-red-500/50 text-red-300 shadow-[0_0_10px_rgba(239,68,68,0.2)]'
                                                : priority === 'medium'
                                                    ? 'bg-yellow-500/20 border border-yellow-500/50 text-yellow-300 shadow-[0_0_10px_rgba(234,179,8,0.2)]'
                                                    : 'bg-blue-500/20 border border-blue-500/50 text-blue-300 shadow-[0_0_10px_rgba(59,130,246,0.2)]'
                                            : 'glass-light border border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                                            }`}
                                    >
                                        {priority}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Budget */}
                <div className="glass rounded-xl p-6 border border-white/10">
                    <div className="flex items-center gap-3 mb-4">
                        <DollarSign className="w-5 h-5 text-green-400" />
                        <h3 className="font-bold text-white">Budget Allocation</h3>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-gray-400 text-lg">$</span>
                        <input
                            type="number"
                            min="0"
                            step="1"
                            value={formData.budget}
                            onChange={(e) => setFormData({ ...formData, budget: parseInt(e.target.value) || 0 })}
                            className="flex-1 px-4 py-3 glass-light rounded-lg border border-white/10 focus:border-violet-500/50 outline-none transition-colors text-white bg-transparent font-mono text-lg"
                        />
                        <span className="text-gray-400 font-medium">USD</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                        Estimated compute and API costs for mission completion
                    </p>
                </div>

                {/* Mission Summary */}
                <div className="glass rounded-xl p-6 border border-cyan-500/30 glow-cyan">
                    <h3 className="font-bold mb-4 text-white">Mission Summary</h3>
                    <div className="space-y-3 text-sm">
                        <div className="flex justify-between border-b border-white/5 pb-2">
                            <span className="text-gray-400">Mission Name:</span>
                            <span className="text-white font-medium">{formData.name || 'Not set'}</span>
                        </div>
                        <div className="flex justify-between border-b border-white/5 pb-2">
                            <span className="text-gray-400">Swarm Size:</span>
                            <span className="text-white font-medium">{formData.swarmSize} agents</span>
                        </div>
                        <div className="flex justify-between border-b border-white/5 pb-2">
                            <span className="text-gray-400">Priority:</span>
                            <span className={`font-medium capitalize ${formData.priority === 'high'
                                ? 'text-red-400'
                                : formData.priority === 'medium'
                                    ? 'text-yellow-400'
                                    : 'text-blue-400'
                                }`}>
                                {formData.priority}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-400">Budget:</span>
                            <span className="text-green-400 font-medium font-mono">${formData.budget}</span>
                        </div>
                    </div>
                </div>

                {/* Submit */}
                <div className="flex gap-4">
                    <button
                        type="submit"
                        disabled={loading}
                        className="flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 transition-all duration-200 glow-violet disabled:opacity-50 disabled:cursor-not-allowed font-bold text-lg text-white shadow-lg shadow-violet-500/25"
                    >
                        {loading ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Deploying...
                            </>
                        ) : (
                            <>
                                <Rocket className="w-5 h-5" />
                                Deploy Mission
                            </>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={() => router.push('/pulse/dashboard')}
                        className="px-6 py-4 rounded-lg glass-light hover:bg-white/10 transition-colors text-gray-300 font-medium"
                    >
                        Cancel
                    </button>
                </div>
            </form>
        </div>
    );
}
