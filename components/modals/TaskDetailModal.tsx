'use client';

import React from 'react';
import { X, Clock, AlertCircle, CheckCircle, User, Shield, Info, Archive, ExternalLink } from 'lucide-react';
import { TaskRecord } from '@/lib/agent/types';
import { cn } from '@/lib/utils';
import ArtifactContent from '../ArtifactContent';

interface TaskDetailModalProps {
    task: TaskRecord;
    isOpen: boolean;
    onClose: () => void;
    onViewArtifact?: (task: TaskRecord) => void;
    onArchive?: (taskId: string) => void;
}

export function TaskDetailModal({ task, isOpen, onClose, onViewArtifact, onArchive }: TaskDetailModalProps) {
    if (!isOpen) return null;

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'pending': return <Clock className="w-5 h-5 text-violet-400" />;
            case 'doing': case 'in_progress': case 'running': return <AlertCircle className="w-5 h-5 text-cyan-400 animate-pulse" />;
            case 'done': case 'completed': return <CheckCircle className="w-5 h-5 text-orange-400" />;
            case 'verified': case 'success': return <CheckCircle className="w-5 h-5 text-green-400" />;
            default: return <Info className="w-5 h-5 text-gray-400" />;
        }
    };

    const getPriorityColor = (priority: any) => {
        const p = typeof priority === 'number' ? priority : 5;
        if (p >= 8) return 'text-red-400 bg-red-400/10 border-red-400/20';
        if (p <= 3) return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
        return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
    };

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" onClick={onClose} />

            <div className="relative glass rounded-3xl w-full max-w-2xl border border-white/10 shadow-[0_0_50px_-12px_rgba(139,92,246,0.3)] overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header Backdrop */}
                <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-violet-500/10 to-transparent pointer-events-none" />

                {/* Top Navigation */}
                <div className="p-6 flex justify-between items-center relative z-10 border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                            {getStatusIcon(task.status)}
                        </div>
                        <div>
                            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em] block mb-0.5">Mission Profile</span>
                            <h3 className="text-xl font-bold text-white leading-tight">{task.title}</h3>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all border border-white/10"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 space-y-8 relative z-10">
                    {/* Status & Priority Ribbon */}
                    <div className="flex flex-wrap gap-3">
                        <div className={cn("px-3 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-wider flex items-center gap-2", getPriorityColor(task.priority))}>
                            <AlertCircle className="w-3 h-3" />
                            Priority: {typeof task.priority === 'number' ? (task.priority >= 8 ? 'High' : task.priority >= 5 ? 'Medium' : 'Low') : task.priority}
                        </div>
                        <div className="px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                            Status: {task.status.toUpperCase()}
                        </div>
                        <div className="px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                            ID: #{String(task.id).slice(0, 8)}
                        </div>
                    </div>

                    {/* Description */}
                    <div className="space-y-3">
                        <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                            <Info className="w-3 h-3" /> Mission Directive
                        </h4>
                        <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 text-sm text-zinc-300 leading-relaxed">
                            {task.description || "No description provided for this mission."}
                        </div>
                    </div>

                    {/* Personnel Involved */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5">
                            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <User className="w-3 h-3" /> Execution Agent
                            </h4>
                            {task.claimed_by || task.assigned_to ? (
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-lg font-bold text-white shadow-lg">
                                        {(task.claimed_by || task.assigned_to || '').replace('trinity-', '')[0]?.toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="font-bold text-white capitalize">{(task.claimed_by || task.assigned_to || '').replace('trinity-', '')}</p>
                                        <p className="text-[10px] text-zinc-500 font-mono">Status: ACTIVE_OWNER</p>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-zinc-600 italic">Unassigned</p>
                            )}
                        </div>

                        <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5">
                            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <Shield className="w-3 h-3" /> Peer Verification
                            </h4>
                            {task.verified_by && task.verified_by.length > 0 ? (
                                <div className="flex -space-x-3">
                                    {task.verified_by.map((v, i) => (
                                        <div key={i} className="w-10 h-10 rounded-xl border-2 border-[#0B0B0F] bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-lg font-bold text-white" title={v}>
                                            {v.replace('trinity-', '')[0].toUpperCase()}
                                        </div>
                                    ))}
                                    <div className="ml-6 flex flex-col justify-center">
                                        <p className="font-bold text-cyan-400 text-sm">{task.verified_by.length} Peer{task.verified_by.length > 1 ? 's' : ''}</p>
                                        <p className="text-[10px] text-zinc-500 font-mono uppercase">Verified</p>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-zinc-600 italic">No verification yet</p>
                            )}
                        </div>
                    </div>

                    {/* Result Preview if exists */}
                    {task.result && (
                        <div className="space-y-3">
                            <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                <ExternalLink className="w-3 h-3" /> Mission Output
                            </h4>
                            <div className="p-4 rounded-2xl bg-black/40 border border-white/5 overflow-auto max-h-48 text-xs font-mono text-zinc-400">
                                {task.result}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="p-6 bg-white/[0.02] border-t border-white/10 flex gap-3">
                    <button
                        onClick={() => onViewArtifact?.(task)}
                        disabled={!task.artifact_url && task.status !== 'done' && task.status !== 'verified'}
                        className="flex-1 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold transition-all shadow-lg flex items-center justify-center gap-2"
                    >
                        <ExternalLink className="w-4 h-4" /> View Full Artifact
                    </button>
                    <button
                        onClick={() => onArchive?.(task.id)}
                        className="px-6 py-3 rounded-xl bg-white/5 hover:bg-amber-500/20 text-zinc-400 hover:text-amber-500 transition-all border border-white/10 flex items-center gap-2"
                    >
                        <Archive className="w-4 h-4" /> Archive
                    </button>
                </div>
            </div>
        </div>
    );
}
