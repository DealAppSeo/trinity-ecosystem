'use client';

import { UserCircle2, MessageSquare, Check, X, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HITLEvent {
    id: string;
    title: string;
    type: 'clarification' | 'validation' | 'phone';
    agent: string;
    timestamp: string;
}

interface HITLActionCenterProps {
    pendingEvents?: HITLEvent[];
    onApprove?: (id: string) => void;
    onReject?: (id: string) => void;
}

export function HITLActionCenter({ pendingEvents = [], onApprove, onReject }: HITLActionCenterProps) {
    const hasEvents = pendingEvents.length > 0;

    return (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 transition-all">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-violet-500/10 flex items-center justify-center text-violet-400">
                        <UserCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-widest">
                            HITL Command Center
                        </h2>
                        <p className="text-[10px] text-zinc-500">PENDING FOUNDER APPROVALS</p>
                    </div>
                </div>
                {hasEvents && (
                    <div className="bg-violet-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-bounce">
                        {pendingEvents.length} NEW
                    </div>
                )}
            </div>

            <div className="space-y-3">
                {hasEvents ? (
                    pendingEvents.map((event) => (
                        <div key={event.id} className="p-4 rounded-xl bg-violet-500/5 border border-violet-500/20 hover:border-violet-500/40 transition-all group">
                            <div className="flex items-start gap-3">
                                <div className="mt-1">
                                    {event.type === 'phone' ? <Phone className="w-4 h-4 text-violet-400" /> : <MessageSquare className="w-4 h-4 text-violet-400" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[9px] font-bold text-violet-400 uppercase tracking-wider">{event.agent}</span>
                                        <span className="text-[8px] text-zinc-600">{new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    <p className="text-xs text-zinc-200 font-medium mb-3 line-clamp-2 leading-relaxed">
                                        {event.title}
                                    </p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => onApprove?.(event.id)}
                                            className="flex-1 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/20 transition-all rounded py-1.5 text-[10px] font-bold flex items-center justify-center gap-1.5"
                                        >
                                            <Check className="w-3 h-3" /> APPROVE
                                        </button>
                                        <button
                                            onClick={() => onReject?.(event.id)}
                                            className="px-3 bg-red-900/20 hover:bg-red-900 text-red-400 hover:text-white border border-red-900/20 transition-all rounded py-1.5 text-[10px] font-bold flex items-center justify-center"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="py-12 text-center border border-dashed border-zinc-800 rounded-xl bg-black/20">
                        <Check className="w-8 h-8 text-zinc-800 mx-auto mb-2" />
                        <p className="text-[11px] text-zinc-600 font-medium">All systems autonomous.</p>
                        <p className="text-[9px] text-zinc-700 mt-1 uppercase tracking-tighter italic">Founders Desk is Clear</p>
                    </div>
                )}
            </div>

            {hasEvents && (
                <button className="w-full mt-4 text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors uppercase tracking-widest font-bold">
                    View Decision Ledger →
                </button>
            )}
        </div>
    );
}
