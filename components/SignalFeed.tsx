'use client';

import { useEffect, useRef, useState } from 'react';
import { Terminal, Shield, Activity, Zap } from 'lucide-react';

interface LogEntry {
    id: string;
    agent: string;
    message: string;
    action: string;
    timestamp: string;
}

export function SignalFeed({ logs = [] }: { logs: any[] }) {
    const containerRef = useRef<HTMLDivElement>(null);

    // Map incoming logs to our display format
    const displayLogs = logs.slice(0, 15).map(log => ({
        id: log.id,
        agent: log.agent_name || log.agent || 'System',
        message: log.message || log.content || 'Processing...',
        action: log.action || 'info',
        timestamp: new Date(log.created_at).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }));

    return (
        <div className="bg-[#09090b] border border-white/5 rounded-3xl overflow-hidden flex flex-col h-full shadow-2xl relative">
            {/* HUD Header */}
            <div className="px-6 py-4 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-violet-500/10 text-violet-400">
                        <Activity size={18} />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-white uppercase tracking-tight">Swarm Signal Feed</h3>
                        <p className="text-[10px] text-gray-500 font-mono">LIVE_STREAM_v8.1.3</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[10px] font-bold text-green-500 uppercase tracking-widest">Active</span>
                </div>
            </div>

            {/* Feed Content */}
            <div
                ref={containerRef}
                className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar font-mono text-[11px]"
            >
                {displayLogs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-600 space-y-2 opacity-50">
                        <Terminal size={24} />
                        <p>Awaiting signal transmission...</p>
                    </div>
                ) : (
                    displayLogs.map((log) => (
                        <div
                            key={log.id}
                            className="group relative flex gap-4 p-3 rounded-xl hover:bg-white/[0.02] transition-all border border-transparent hover:border-white/5"
                        >
                            <div className="shrink-0 text-gray-600 select-none pt-1">
                                {log.timestamp}
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-violet-400 font-bold uppercase tracking-tighter">
                                        {log.agent}
                                    </span>
                                    <span className="w-1 h-1 rounded-full bg-white/10" />
                                    <span className="text-gray-500 text-[9px] uppercase">
                                        {log.action}
                                    </span>
                                </div>
                                <div className="text-gray-300 leading-relaxed break-words">
                                    {log.message}
                                </div>
                            </div>

                            {/* Micro-interaction highlight */}
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-0 group-hover:h-1/2 bg-violet-500 transition-all duration-300" />
                        </div>
                    ))
                )}
            </div>

            {/* Footer / Stats */}
            <div className="px-6 py-3 border-t border-white/5 bg-white/[0.01] flex items-center justify-between text-[10px]">
                <div className="text-gray-500 uppercase flex items-center gap-2">
                    <Shield size={12} className="text-violet-500/50" />
                    BFT Consensus: <span className="text-white font-bold text-[9px]">ENABLED</span>
                </div>
                <div className="text-gray-500 font-mono">
                    BUF_SIZE: 100_NODES
                </div>
            </div>

            <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.1);
        }
      `}</style>
        </div>
    );
}
