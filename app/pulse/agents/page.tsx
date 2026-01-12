'use client';

export const dynamic = 'force-dynamic';

import { AgentGrid } from '@/components/AgentGrid';
import { useTrinityController } from '@/hooks/useTrinityController';
import { Skeleton } from '@/components/ui/Skeleton';

export default function AgentsPage() {
    const { agents, loading } = useTrinityController();

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-3xl font-bold text-white">Agent Swarm Registry</h1>
                <div className="text-sm text-gray-400">
                    {agents.filter(a => a.status === 'active').length} / {agents.length} Online
                </div>
            </div>

            {loading && agents.length === 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[...Array(6)].map((_, i) => (
                        <Skeleton key={i} className="h-64 rounded-2xl bg-zinc-900/50" />
                    ))}
                </div>
            ) : (
                <AgentGrid agents={agents} isConductor={true} />
            )}
        </div>
    );
}
