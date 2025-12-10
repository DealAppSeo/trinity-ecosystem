'use client';

import { Header } from '@/components/Header';
import { AgentGrid } from '@/components/AgentGrid';
import { CostTicker } from '@/components/CostTicker';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { TaskQueue } from '@/components/TaskQueue';
import { ActivityFeed } from '@/components/ActivityFeed';
import { useEffect, useState } from 'react';
import { Agent, TrinityTask } from '@/types';
import { useSupabaseSubscription } from '@/hooks/useSupabaseSubscription';
import QRCode from 'qrcode';
import { AddTaskModal } from '@/components/modals/AddTaskModal';
import { Skeleton } from '@/components/ui/Skeleton';

export default function ConductorPage() {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [tasks, setTasks] = useState<TrinityTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [showShare, setShowShare] = useState(false);
    const [showAddTask, setShowAddTask] = useState(false);
    const [qrUrl, setQrUrl] = useState('');

    // Initial Data Fetch
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            const { data: agentData } = await supabase.from('agent_status').select('*').order('agent_name');
            if (agentData) setAgents(agentData as Agent[]);

            const { data: taskData } = await supabase.from('trinity_tasks').select('*').neq('status', 'completed').order('priority', { ascending: false });
            if (taskData) setTasks(taskData as TrinityTask[]);

            setLoading(false);
        };
        fetchData();
    }, []);

    // Realtime Subscriptions
    useSupabaseSubscription('agent_status', (payload) => {
        supabase.from('agent_status').select('*').order('agent_name').then(({ data }) => {
            if (data) setAgents(data as Agent[]);
        });
    });

    useSupabaseSubscription('trinity_tasks', () => {
        supabase.from('trinity_tasks').select('*').neq('status', 'completed').order('priority', { ascending: false }).then(({ data }) => {
            if (data) setTasks(data as TrinityTask[]);
        });
    });

    const generateInvite = async () => {
        const code = Math.random().toString(36).substring(7);
        const url = `https://aitrinitysymphony.com/pulse?i=${code}`;
        const qr = await QRCode.toDataURL(url, { color: { dark: '#e4e4e7', light: '#00000000' } });
        setQrUrl(qr);
        setShowShare(true);
    };

    return (
        <div className="min-h-screen bg-obsidian-base flex flex-col">
            <Header
                title="CONDUCTOR CONSOLE"
                showLive
                viewerCount={12}
                rightContent={
                    <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={generateInvite}>Share Access</Button>
                    </div>
                }
            />

            <main className="flex-1 container mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-140px)]">

                {/* LEFT COLUMN: Grid & Activity */}
                <div className="lg:col-span-3 flex flex-col gap-6 h-full overflow-hidden">

                    {/* Agents Grid */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-xl font-semibold text-text-primary">Symphony Grid</h2>
                            <div className="flex gap-2">
                                {loading ? (
                                    <Skeleton className="w-24 h-6" />
                                ) : (
                                    <span className="text-xs text-status-online bg-status-online/10 px-2 py-1 rounded border border-status-online/20">
                                        {agents.filter(a => a.status === 'online' || a.status === 'working').length}/{agents.length} Online
                                    </span>
                                )}
                            </div>
                        </div>

                        {loading ? (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
                            </div>
                        ) : (
                            <AgentGrid agents={agents} isConductor={true} />
                        )}
                    </div>

                    {/* Activity Feed (Bottom) */}
                    <div className="h-48 shrink-0">
                        <ActivityFeed />
                    </div>
                </div>

                {/* RIGHT COLUMN: Tasks & Stats */}
                <div className="lg:col-span-1 flex flex-col gap-6 h-full">
                    <div className="h-1/2">
                        <TaskQueue tasks={tasks} onAddTask={() => setShowAddTask(true)} />
                    </div>

                    <div className="h-1/2 flex flex-col gap-4">
                        {/* Quick Actions / Stats */}
                        <div className="p-4 bg-obsidian-surface border border-obsidian-border rounded-lg">
                            <h3 className="text-sm font-bold text-text-primary mb-3">System Health</h3>
                            <div className="space-y-2 text-sm text-text-secondary">
                                <div className="flex justify-between">
                                    <span>Response Time</span>
                                    <span className="text-status-online font-mono">24ms</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Error Rate</span>
                                    <span className="text-status-online font-mono">0.01%</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Tokens/sec</span>
                                    <span className="text-accent-violet font-mono">842</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 p-4 bg-obsidian-surface border border-obsidian-border rounded-lg flex flex-col justify-center items-center text-center">
                            <h3 className="text-sm text-text-muted mb-2">Daily Efficiency</h3>
                            <span className="text-4xl font-bold text-status-online">99.9%</span>
                            <span className="text-xs text-text-muted mt-1">Optimization active</span>
                        </div>
                    </div>
                </div>

            </main>

            <CostTicker traditional={847.00} trinity={0.47} />

            {/* Manual Modal Implementation (Share) */}
            {showShare && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowShare(false)}>
                    <div className="bg-obsidian-elevated border border-obsidian-border rounded-xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
                        <h3 className="text-xl font-bold text-text-primary mb-4 text-center">Secure Invite Link</h3>
                        <div className="bg-white p-4 rounded-lg mb-4 flex justify-center">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={qrUrl} alt="Invite QR" className="w-48 h-48" />
                        </div>
                        <p className="text-center text-text-muted text-sm mb-6">
                            Scan to grant instant observatory access.
                        </p>
                        <Button className="w-full" onClick={() => setShowShare(false)}>
                            Close
                        </Button>
                    </div>
                </div>
            )}

            <AddTaskModal
                isOpen={showAddTask}
                onClose={() => setShowAddTask(false)}
                availableAgents={agents}
            />
        </div>
    );
}
