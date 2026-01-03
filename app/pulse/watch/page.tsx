'use client';

import { Header } from '@/components/Header';
import { AgentGrid } from '@/components/AgentGrid';
import { CostTicker } from '@/components/CostTicker';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';
import { AgentRegistryRecord } from '@/lib/agent/types';
import { useSupabaseSubscription } from '@/hooks/useSupabaseSubscription';
import { SignalUnlockModal } from '@/components/modals/SignalUnlockModal';
import { Skeleton } from '@/components/ui/Skeleton';

export default function WatchPage() {
    const [agents, setAgents] = useState<AgentRegistryRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [greetingPlayed, setGreetingPlayed] = useState(false);
    const [showSignalModal, setShowSignalModal] = useState(false);
    const [signalUnlocked, setSignalUnlocked] = useState(false);

    // Initial Data
    useEffect(() => {
        const fetchAgents = async () => {
            setLoading(true);
            const { data } = await supabase.from('trinity_agent_registry').select('*').order('agent_name');
            if (data) setAgents(data as AgentRegistryRecord[]);
            setLoading(false);
        };
        fetchAgents();

        // Mel Greeting Logic (Try to play on mount)
        const hasVisited = localStorage.getItem('mel_greeted');
        if (!hasVisited && !greetingPlayed) {
            const msg = new SpeechSynthesisUtterance("Welcome to the Trinity Pulse. Observe the symphony of intelligence.");
            const voices = window.speechSynthesis.getVoices();
            const femaleVoice = voices.find(v => v.name.includes('Female') || v.name.includes('Google US English'));
            if (femaleVoice) msg.voice = femaleVoice;

            // This might be blocked by browsers, but we try anyway
            window.speechSynthesis.speak(msg);
            localStorage.setItem('mel_greeted', 'true');
            setGreetingPlayed(true);
        }
    }, [greetingPlayed]);

    // Realtime
    useSupabaseSubscription('trinity_agent_registry', () => {
        supabase.from('trinity_agent_registry').select('*').order('agent_name').then(({ data }) => {
            if (data) setAgents(data as AgentRegistryRecord[]);
        });
    });

    return (
        <div className="min-h-screen bg-obsidian-base flex flex-col">
            {/* WATCHING BANNER */}
            <div className="bg-accent-violet/10 border-b border-accent-violet/20 px-4 py-2 text-center text-xs font-mono text-accent-violet animate-pulse">
                👁️ You are watching the HyperDAG Symphony live
            </div>

            <Header
                title="TRINITY LIVE VIEW"
                showLive
                viewerCount={1243}
            />

            <main className="flex-1 container mx-auto px-4 py-6">
                <div className="mb-8">
                    <h2 className="text-xl font-semibold text-text-primary">Global Grid Status</h2>
                    <p className="text-sm text-text-secondary">Read-only observatory mode. System is autonomous.</p>
                </div>

                {/* Agent Grid - Read Only */}
                {loading ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
                    </div>
                ) : (
                    <AgentGrid agents={agents} isConductor={false} />
                )}

                {/* Signal Section */}
                <div className="mt-12">
                    {!signalUnlocked ? (
                        <div className="p-6 rounded-xl bg-gradient-to-r from-obsidian-elevated to-obsidian-surface border border-obsidian-border flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-accent-violet/20 flex items-center justify-center text-accent-violet">
                                    ⚡
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-text-primary">Unlock Trinity Signal</h3>
                                    <p className="text-text-muted text-sm mt-1">See what 47 smart money investors are exploring today.</p>
                                </div>
                            </div>
                            <Button
                                onClick={() => setShowSignalModal(true)}
                                className="shadow-glow-violet whitespace-nowrap"
                            >
                                Reveal Insights
                            </Button>
                        </div>
                    ) : (
                        <div className="p-6 rounded-xl bg-obsidian-elevated border border-accent-violet/30 animate-fade-in">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                                    <span className="text-accent-violet">⚡</span> Trinity Signal Alpha
                                </h3>
                                <span className="text-xs font-mono text-status-online">LIVE FEED</span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="p-4 bg-obsidian-surface border border-obsidian-border rounded-lg">
                                    <h4 className="text-xs text-text-muted uppercase tracking-wider mb-2">Top Trend</h4>
                                    <p className="font-bold text-text-primary">Autonomous Finance</p>
                                    <div className="mt-2 w-full bg-obsidian-base h-1 rounded-full overflow-hidden">
                                        <div className="bg-accent-violet w-[85%] h-full" />
                                    </div>
                                </div>
                                <div className="p-4 bg-obsidian-surface border border-obsidian-border rounded-lg">
                                    <h4 className="text-xs text-text-muted uppercase tracking-wider mb-2">Smart Money Flow</h4>
                                    <p className="font-bold text-text-primary">+142% WoW</p>
                                    <div className="mt-2 w-full bg-obsidian-base h-1 rounded-full overflow-hidden">
                                        <div className="bg-status-online w-[65%] h-full" />
                                    </div>
                                </div>
                                <div className="p-4 bg-obsidian-surface border border-obsidian-border rounded-lg">
                                    <h4 className="text-xs text-text-muted uppercase tracking-wider mb-2">Ecosystem Growth</h4>
                                    <p className="font-bold text-text-primary">5 New Apps</p>
                                    <div className="mt-2 w-full bg-obsidian-base h-1 rounded-full overflow-hidden">
                                        <div className="bg-gold w-[45%] h-full" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

            </main>
            <CostTicker traditional={847.00} trinity={0.47} />

            <SignalUnlockModal
                isOpen={showSignalModal}
                onClose={() => setShowSignalModal(false)}
                onUnlock={() => setSignalUnlocked(true)}
            />
        </div>
    );
}
