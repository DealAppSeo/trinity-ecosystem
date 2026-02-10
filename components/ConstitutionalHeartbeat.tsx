'use client';

import { ShieldCheck, Heart, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

interface HeartbeatProps {
    status?: 'aligned' | 'violating' | 'loading';
    lastVirtue?: string;
    recentEvents?: any[];
}

export function ConstitutionalHeartbeat({ status = 'aligned', lastVirtue = 'Truth', recentEvents = [] }: HeartbeatProps) {
    const isViolating = status === 'violating' || recentEvents.some(e => e.message?.includes('VIOLATION'));

    return (
        <div className={cn(
            "bg-zinc-900/50 border rounded-2xl p-6 relative overflow-hidden transition-all duration-700",
            isViolating ? "border-red-500/50 bg-red-500/5" : "border-emerald-500/30 bg-emerald-500/5"
        )}>
            {/* Pulsing Background Ring */}
            <div className={cn(
                "absolute -top-12 -right-12 w-48 h-48 rounded-full blur-3xl opacity-20 animate-pulse",
                isViolating ? "bg-red-500" : "bg-emerald-500"
            )} />

            <div className="flex items-center justify-between mb-4 relative z-10">
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center shadow-lg",
                        isViolating ? "bg-red-900/50 text-red-400" : "bg-emerald-900/50 text-emerald-400"
                    )}>
                        {isViolating ? <AlertCircle className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
                    </div>
                    <div>
                        <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-widest">
                            Constitutional Heartbeat
                        </h2>
                        <p className={cn("text-[10px] font-medium", isViolating ? "text-red-400" : "text-emerald-400")}>
                            {isViolating ? "PROTECTION PROTOCOL ACTIVE" : "SYSTEM ALIGNED WITH PHIL. 4:8"}
                        </p>
                    </div>
                </div>
                <div className="flex flex-col items-end">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-tighter">Current Virtue</span>
                    <span className={cn("text-xs font-bold font-mono", isViolating ? "text-red-400" : "text-emerald-400")}>
                        {isViolating ? "JUSTICE" : lastVirtue.toUpperCase()}
                    </span>
                </div>
            </div>

            {/* Visual Beat Line */}
            <div className="h-1 w-full bg-zinc-800 rounded-full mb-4 overflow-hidden relative">
                <div className={cn(
                    "h-full rounded-full transition-all duration-1000",
                    isViolating ? "bg-red-500 animate-[pulse_1.5s_infinite]" : "bg-emerald-500 animate-[pulse_3s_infinite]"
                )} style={{ width: '100%' }} />
            </div>

            <div className="space-y-2 relative z-10">
                {recentEvents.length > 0 ? (
                    recentEvents.slice(0, 2).map((event, i) => (
                        <div key={i} className="flex items-center gap-2 text-[10px]">
                            <span className={cn(
                                "w-1.5 h-1.5 rounded-full shrink-0",
                                event.message?.includes('VIOLATION') ? "bg-red-500" : "bg-emerald-500"
                            )} />
                            <span className="text-zinc-400 truncate">{event.message}</span>
                            <span className="text-zinc-600 ml-auto whitespace-nowrap">
                                {new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    ))
                ) : (
                    <div className="text-[10px] text-zinc-600 italic">Listening for governance signals...</div>
                )}
            </div>
        </div>
    );
}
