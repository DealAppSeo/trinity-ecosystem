'use client';

import { Network, Database, BrainCircuit, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SovereignMemoryProps {
    nodeCount?: number;
    relationCount?: number;
    lastSync?: string;
    isSyncing?: boolean;
}

export function SovereignMemoryExplorer({ nodeCount = 0, relationCount = 0, lastSync, isSyncing = false }: SovereignMemoryProps) {
    return (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 relative overflow-hidden">
            {/* Visual Grid Background */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #8b5cf6 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

            <div className="flex items-center justify-between mb-6 relative z-10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-violet-600/10 flex items-center justify-center text-violet-400">
                        <BrainCircuit className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-widest">
                            Sovereign Graph
                        </h2>
                        <p className="text-[10px] text-zinc-500">NEO4J MEMORY ENGINE</p>
                    </div>
                </div>
                {isSyncing && (
                    <div className="flex items-center gap-2">
                        <div className="w-1 h-1 bg-violet-400 rounded-full animate-ping" />
                        <span className="text-[10px] text-violet-400 font-bold tracking-widest uppercase">Syncing</span>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6 relative z-10">
                <div className="bg-black/40 border border-white/5 p-4 rounded-xl text-center">
                    <Database className="w-4 h-4 text-violet-500 mx-auto mb-2" />
                    <div className="text-xl font-bold text-zinc-100 font-mono">{nodeCount}</div>
                    <div className="text-[9px] text-zinc-500 uppercase tracking-wider">Nodes</div>
                </div>
                <div className="bg-black/40 border border-white/5 p-4 rounded-xl text-center">
                    <Share2 className="w-4 h-4 text-violet-500 mx-auto mb-2" />
                    <div className="text-xl font-bold text-zinc-100 font-mono">{relationCount}</div>
                    <div className="text-[9px] text-zinc-500 uppercase tracking-wider">Edges</div>
                </div>
            </div>

            <div className="space-y-3 relative z-10">
                <div className="flex items-center justify-between p-2 rounded bg-violet-500/5 border border-violet-500/10">
                    <span className="text-[9px] text-zinc-400 uppercase">Last Synchronization</span>
                    <span className="text-[9px] text-zinc-200 font-mono">
                        {lastSync ? new Date(lastSync).toLocaleTimeString() : 'NEVER'}
                    </span>
                </div>

                <button className="w-full bg-violet-600 hover:bg-violet-700 text-white py-2 rounded-lg text-xs font-bold transition-all shadow-lg shadow-violet-900/20 flex items-center justify-center gap-2 mt-2">
                    <Network className="w-3.5 h-3.5" /> OPEN GRAPH EXPLORER
                </button>
            </div>
        </div>
    );
}
