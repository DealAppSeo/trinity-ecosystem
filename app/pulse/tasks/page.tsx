'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Plus, Clock, AlertCircle, CheckCircle, XCircle, HelpCircle, MessageSquare, Eye, Lock, FileText, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTrinityController } from '@/hooks/useTrinityController';
import { TaskRecord } from '@/lib/agent/types';
import { useToast } from '@/components/ui/Toast';
import { UnlockModal, RegistrationModal } from '@/components/AccessModals';
import ArtifactContent from '@/components/ArtifactContent';
import { TaskDetailModal } from '@/components/modals/TaskDetailModal';

export default function TasksPage() {
    const { tasks: initialTasks, refresh } = useTrinityController();
    const { showToast } = useToast();
    const [tasks, setTasks] = useState<TaskRecord[]>([]);
    const [newTask, setNewTask] = useState({ title: '', description: '', priority: 'medium' });
    const [showNewTaskForm, setShowNewTaskForm] = useState(false);
    const [selectedTask, setSelectedTask] = useState<TaskRecord | null>(null);

    // Artifact Viewer States
    const [selectedArtifact, setSelectedArtifact] = useState<{ title: string; content: string } | null>(null);
    const [showUnlockModal, setShowUnlockModal] = useState(false);
    const [showRegModal, setShowRegModal] = useState(false);
    const [pendingArtifact, setPendingArtifact] = useState<{ title: string; content: string } | null>(null);
    const [hasRegistered, setHasRegistered] = useState(false);

    // Clarification Modal States
    const [clarifyTask, setClarifyTask] = useState<TaskRecord | null>(null);
    const [clarification, setClarification] = useState('');

    // Spreadsheet / Archive Explorer
    const [explorerType, setExplorerType] = useState<'failed' | 'archived' | null>(null);
    const [role, setRole] = useState<'founder' | 'guest'>('guest');

    useEffect(() => {
        const roleMatch = document.cookie.match(/trinity_role=([^;]+)/);
        if (roleMatch) {
            setRole(roleMatch[1] as any);
        } else {
            // Fallback to localStorage
            const localRole = localStorage.getItem('trinity_role');
            if (localRole) setRole(localRole as any);
        }
    }, []);

    const isFounder = role === 'founder';

    useEffect(() => {
        if (localStorage.getItem('trinity_registration')) {
            setHasRegistered(true);
        }
    }, []);

    useEffect(() => {
        if (initialTasks) setTasks(initialTasks);
    }, [initialTasks]);

    const createTask = async () => {
        if (!isFounder) {
            showToast('Founder access required to create tasks.', 'error');
            return;
        }
        if (!newTask.title.trim()) return;

        // Haptic
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);

        try {
            // Map Priority to Int
            const pMap: Record<string, number> = { 'low': 2, 'medium': 5, 'high': 8 };

            const { data, error } = await supabase
                .from('trinity_tasks')
                .insert([{
                    title: newTask.title,
                    description: newTask.description,
                    priority: pMap[newTask.priority] || 5, // Store as Int
                    status: 'pending',
                    task_type: 'manual',
                    created_at: new Date().toISOString()
                }])
                .select()
                .single();

            if (error) throw error;

            if (data) {
                setTasks([data as unknown as TaskRecord, ...tasks]);
                setNewTask({ title: '', description: '', priority: 'medium' });
                setShowNewTaskForm(false);
                refresh();
                showToast('Task Created', 'success');
            }
        } catch (error: any) {
            console.error('Error creating task:', error);
            showToast('Failed to create task', 'error');
        }
    };

    const updateTaskStatus = async (taskId: string, newStatus: string) => {
        if (!isFounder) {
            showToast('Founder access required to move tasks.', 'error');
            return;
        }
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(5);

        let dbStatus = newStatus;
        if (newStatus === 'todo') dbStatus = 'pending';
        if (newStatus === 'doing') dbStatus = 'doing';
        if (newStatus === 'done') dbStatus = 'done';
        if (newStatus === 'verified') dbStatus = 'verified';
        if (newStatus === 'failed') dbStatus = 'failed';

        setTasks(tasks.map((t) => (t.id === taskId ? { ...t, status: dbStatus } : t)));

        try {
            const { error } = await supabase
                .from('trinity_tasks')
                .update({ status: dbStatus })
                .eq('id', taskId);

            if (error) throw error;
            refresh();
        } catch (error) {
            refresh();
            showToast('Failed to update status', 'error');
        }
    };

    const archiveTask = async (taskId: string) => {
        if (!isFounder) {
            showToast('Founder access required to archive tasks.', 'error');
            return;
        }
        if (!confirm('Archive this task? it will be moved to the archives below.')) return;

        // Haptic on Archive
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([20, 50]);

        setTasks(tasks.map((t) => t.id === taskId ? { ...t, status: 'archived' } : t));

        try {
            const { error } = await supabase.from('trinity_tasks').update({ status: 'archived' }).eq('id', taskId);
            if (error) throw error;
            refresh();
            showToast('Task Archived', 'info');
        } catch (error) {
            console.error('Error archiving task:', error);
            refresh();
            showToast('Failed to archive task', 'error');
        }
    };

    const getTasksByStatus = (status: string) => {
        let dbStatus = [status];
        if (status === 'todo') dbStatus = ['pending'];
        if (status === 'doing') dbStatus = ['doing', 'in_progress', 'running'];
        if (status === 'done') dbStatus = ['done', 'completed'];
        if (status === 'verified') dbStatus = ['verified', 'success'];
        if (status === 'pending_clarification') dbStatus = ['pending_clarification'];
        if (status === 'failed') dbStatus = ['failed'];
        if (status === 'archived') dbStatus = ['archived'];

        return tasks
            .filter((task) => dbStatus.includes(task.status))
            .sort((a, b) => {
                // Sort by Priority Descending (High > Low)
                const pA = typeof a.priority === 'number' ? a.priority : 5;
                const pB = typeof b.priority === 'number' ? b.priority : 5;
                if (pB !== pA) return pB - pA;

                // Then by Date Descending (Newer first)
                return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
            });
    };

    const getTaskPriorityColorV2 = (rawPriority: any) => {
        // V3.2 CACHE BUSTER & SAFETY FIX
        try {
            if (rawPriority === null || rawPriority === undefined) return 'border-yellow-500/50 bg-yellow-500/10';

            // Handle Numbers
            if (typeof rawPriority === 'number') {
                if (rawPriority >= 8) return 'border-red-500/50 bg-red-500/10 shadow-[0_0_10px_rgba(239,68,68,0.1)]';
                if (rawPriority <= 3) return 'border-blue-500/50 bg-blue-500/10';
                return 'border-yellow-500/50 bg-yellow-500/10';
            }

            // Force safe string conversion
            const pStr = String(rawPriority);
            // Explicit type check before calling method
            if (typeof pStr.toLowerCase !== 'function') return 'border-yellow-500/50 bg-yellow-500/10';

            const pLower = pStr.toLowerCase();

            if (pLower === 'high' || pLower === 'critical') return 'border-red-500/50 bg-red-500/10 shadow-[0_0_10px_rgba(239,68,68,0.1)]';
            if (pLower === 'low') return 'border-blue-500/50 bg-blue-500/10';

            return 'border-yellow-500/50 bg-yellow-500/10';
        } catch (e) {
            console.error("Priority Color Error:", e);
            return 'border-gray-500/50 bg-gray-500/10';
        }
    };

    const handleViewArtifact = async (task: TaskRecord) => {
        // Gates disabled for accessibility - direct access enabled
        try {
            // Extract artifact ID from db://trinity_artifacts/ID or use task ID
            let artifactId = task.artifact_url?.split('/').pop();

            // Build query part safely
            let query = `task_id.eq.${task.id}`;
            if (artifactId && artifactId !== 'undefined' && artifactId !== 'null' && isNaN(parseInt(artifactId)) === false) {
                query = `id.eq.${artifactId},${query}`;
            }

            const { data, error } = await supabase
                .from('trinity_artifacts')
                .select('*')
                .or(query)
                .order('created_at', { ascending: false }) // Take latest if multiple
                .limit(1)
                .maybeSingle();

            if (error || !data) {
                // FALLBACK: If no record in trinity_artifacts, show the task result if it exists
                if (task.result) {
                    setSelectedArtifact({
                        title: `Result for ${task.title}`,
                        content: task.result
                    });
                    return;
                }
                showToast('No artifact found for this task yet.', 'info');
                return;
            }

            setSelectedArtifact({ title: data.title, content: data.content });
        } catch (e) {
            showToast('Failed to load artifact', 'error');
        }
    };

    const handleClarifySubmit = async () => {
        if (!isFounder) {
            showToast('Founder access required to clarify tasks.', 'error');
            return;
        }
        if (!clarifyTask || !clarification.trim()) return;

        try {
            const { error } = await supabase.from('trinity_tasks').update({
                status: 'pending',
                description: `${clarifyTask.description}\n\n[USER CLARIFICATION]: ${clarification}`
            }).eq('id', clarifyTask.id);

            if (error) throw error;

            showToast('Clarification Sent', 'success');
            setClarifyTask(null);
            setClarification('');
            refresh();
        } catch (e) {
            showToast('Failed to send clarification', 'error');
        }
    };

    const columns = [
        { id: 'todo', title: 'To Do Missions', icon: Clock, color: 'violet' },
        { id: 'doing', title: 'Active Missions', icon: AlertCircle, color: 'cyan' },
        { id: 'pending_clarification', title: 'Clarification Needed', icon: HelpCircle, color: 'amber' },
        { id: 'done', title: 'Done Missions', icon: CheckCircle, color: 'orange' },
        { id: 'verified', title: 'Verified Missions', icon: CheckCircle, color: 'green' },
    ];

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header consolidated into root NavBar */}
            <div className="flex justify-end mb-4">
                <button
                    onClick={() => isFounder ? setShowNewTaskForm(!showNewTaskForm) : showToast('Founder access required.', 'info')}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-violet-500 to-cyan-500 hover:from-violet-600 hover:to-cyan-600 transition-all duration-200 glow-violet shadow-lg shadow-violet-500/20",
                        !isFounder && "opacity-50 grayscale cursor-not-allowed"
                    )}
                >
                    <Plus className="w-5 h-5" />
                    <span className="font-medium">New Task</span>
                </button>
            </div>

            {/* Iron Gate Banner (Guest Mode) */}
            {!isFounder && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center justify-between mb-4 animate-in slide-in-from-top duration-500">
                    <div className="flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-500" />
                        <div>
                            <p className="text-sm font-bold text-amber-400">Guest Access: Read-Only Board</p>
                            <p className="text-xs text-amber-500/70">You can audit mission progress, but command actions require registration.</p>
                        </div>
                    </div>
                </div>
            )}

            {/* New Task Form */}
            {showNewTaskForm && (
                <div className="glass rounded-xl p-6 border border-violet-500/30 glow-violet">
                    <h3 className="text-lg font-bold mb-4">Create New Task</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Title</label>
                            <input
                                type="text"
                                value={newTask.title}
                                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                                placeholder="Enter task title..."
                                className="w-full px-4 py-2 glass-light rounded-lg border border-white/10 focus:border-violet-500/50 outline-none transition-colors text-gray-200 placeholder-gray-500 bg-transparent"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Description</label>
                            <textarea
                                value={newTask.description}
                                onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                                placeholder="Enter task description..."
                                rows={3}
                                className="w-full px-4 py-2 glass-light rounded-lg border border-white/10 focus:border-violet-500/50 outline-none transition-colors text-gray-200 placeholder-gray-500 resize-none bg-transparent"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Priority</label>
                            <select
                                value={newTask.priority}
                                onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                                className="px-4 py-2 glass-light rounded-lg border border-white/10 focus:border-violet-500/50 outline-none transition-colors text-gray-200 bg-[#0B0B0F]"
                            >
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                            </select>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={createTask}
                                className="px-4 py-2 rounded-lg bg-violet-500 hover:bg-violet-600 transition-colors font-medium shadow-lg shadow-violet-500/20"
                            >
                                Create Task
                            </button>
                            <button
                                onClick={() => setShowNewTaskForm(false)}
                                className="px-4 py-2 rounded-lg glass-light hover:bg-white/10 transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Kanban Board */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 overflow-x-auto pb-4">
                {columns.map((column) => {
                    const Icon = column.icon;
                    const columnTasks = getTasksByStatus(column.id);

                    return (
                        <div key={column.id} className="glass rounded-xl p-4 border border-white/10 min-w-[280px]">
                            <div className="flex items-center gap-2 mb-4">
                                <div className={`p-2 rounded-lg bg-${column.color}-500/10 ${column.id === 'pending_clarification' ? 'animate-pulse' : ''}`}>
                                    <Icon className={`w-5 h-5 text-${column.color}-400`} style={{
                                        color: column.id === 'todo' ? '#a78bfa' :
                                            column.id === 'doing' ? '#22d3ee' :
                                                column.id === 'pending_clarification' ? '#fbbf24' :
                                                    column.id === 'done' ? '#fb923c' :
                                                        column.id === 'verified' ? '#4ade80' : '#f87171'
                                    }} />
                                </div>
                                <h3 className="font-bold">{column.title}</h3>
                                <span className="ml-auto text-xs font-mono bg-white/5 px-2 py-1 rounded-md text-gray-400">{columnTasks.length}</span>
                            </div>

                            <div
                                className="space-y-3 min-h-[200px] max-h-[70vh] overflow-y-auto pr-2 scrollbar-hide hover:scrollbar-default transition-all"
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    const taskId = e.dataTransfer.getData('taskId');
                                    if (taskId) updateTaskStatus(taskId, column.id);
                                }}
                            >
                                {columnTasks.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-white/5 rounded-lg">
                                        <p className="text-gray-600 text-sm">No tasks</p>
                                    </div>
                                ) : (
                                    columnTasks.map((task) => (
                                        <div
                                            key={task.id}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedTask(task);
                                            }}
                                            className={`glass-light rounded-lg p-4 border ${getTaskPriorityColorV2(task.priority)} hover:scale-[1.02] transition-all duration-200 cursor-pointer shadow-lg`}
                                            draggable
                                            onDragStart={(e) => {
                                                e.stopPropagation();
                                                e.dataTransfer.setData('taskId', task.id);
                                            }}
                                        >
                                            <div className="mb-3">
                                                <h4 className="font-bold text-sm mb-1 text-white leading-tight">{task.title}</h4>
                                                {task.description && (
                                                    <p className="text-xs text-gray-400 line-clamp-2">{task.description}</p>
                                                )}
                                            </div>

                                            <div className="flex items-center justify-between pt-2 border-t border-white/5">
                                                <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${(typeof task.priority === 'number' && task.priority >= 8) || task.priority === 'high' ? 'text-red-400 bg-red-400/10' :
                                                    (typeof task.priority === 'number' && task.priority <= 3) || task.priority === 'low' ? 'text-blue-400 bg-blue-400/10' :
                                                        'text-yellow-400 bg-yellow-400/10'
                                                    }`}>
                                                    {task.verify_count !== undefined && task.verify_count > 0 && (
                                                        <span className="text-[10px] font-mono text-gray-500 mr-2">
                                                            {task.verify_count}/3
                                                        </span>
                                                    )}
                                                    {typeof task.priority === 'number'
                                                        ? (task.priority >= 8 ? 'HIGH' : task.priority >= 5 ? 'MEDIUM' : 'LOW')
                                                        : (task.priority || 'MEDIUM')}
                                                </span>

                                                <div className="flex items-center gap-2">
                                                    {column.id !== 'todo' && (task.assigned_to || task.claimed_by) && (
                                                        <div className="flex flex-col items-end gap-1.5">
                                                            {/* Ownership Detail */}
                                                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-white/10"
                                                                title={`Assigned/Claimed by: ${task.assigned_to || task.claimed_by}`}>
                                                                <div className="flex flex-col items-end">
                                                                    <span className="text-[8px] text-gray-500 font-bold uppercase tracking-tighter">
                                                                        {task.status === 'pending' ? 'ASSIGNED' : 'COMPLETED BY'}
                                                                    </span>
                                                                    <div className="flex items-center gap-1.5">
                                                                        <div className="w-3.5 h-3.5 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-[7px] font-bold text-white shadow-sm shrink-0">
                                                                            {(task.assigned_to || task.claimed_by || '').replace('trinity-', '')[0]?.toUpperCase() || '?'}
                                                                        </div>
                                                                        <span className="text-[10px] font-mono text-zinc-300">
                                                                            {(task.assigned_to || task.claimed_by || '').replace('trinity-', '').toUpperCase()}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Verification Detail */}
                                                            {task.verified_by && task.verified_by.length > 0 && (
                                                                <div className="flex flex-col items-end" title={`Verified by: ${task.verified_by.join(', ')}`}>
                                                                    <span className="text-[8px] text-cyan-500 font-bold uppercase tracking-tighter">VERIFIED BY</span>
                                                                    <div className="flex -space-x-1.5 overflow-hidden">
                                                                        {task.verified_by.map((v, i) => (
                                                                            <div key={i} className="inline-block w-3.5 h-3.5 rounded-full ring-[1px] ring-[#0B0B0F] bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-[7px] font-bold text-white" title={v}>
                                                                                {v.replace('trinity-', '')[0]?.toUpperCase()}
                                                                            </div>
                                                                        ))}
                                                                        <span className="ml-2 text-[9px] font-mono text-cyan-400 self-center">
                                                                            {task.verified_by.length}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); archiveTask(task.id); }}
                                                        className="text-gray-600 hover:text-white hover:bg-amber-500/20 transition-all p-1.5 rounded-md"
                                                        title="Archive Task"
                                                    >
                                                        <XCircle className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* [PHASE 10] ASK AGENT INTERACTION */}
                                            {task.status === 'pending_clarification' && (
                                                <div className="mt-3 pt-3 border-t border-amber-500/20">
                                                    <button
                                                        onClick={() => setClarifyTask(task)}
                                                        className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded bg-amber-500/20 hover:bg-amber-500/40 border border-amber-500/30 text-amber-400 text-[10px] font-bold transition-all"
                                                    >
                                                        <MessageSquare className="w-3 h-3" /> ASK AGENT
                                                    </button>
                                                </div>
                                            )}

                                            {/* DIRECT ARTIFACT ACCESS */}
                                            {(task.status === 'done' || task.status === 'verified' || task.artifact_url) && (
                                                <div className="mt-2">
                                                    <button
                                                        onClick={() => handleViewArtifact(task)}
                                                        className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 text-violet-400 text-[10px] font-bold transition-all"
                                                    >
                                                        <Eye className="w-3 h-3" /> VIEW ARTIFACT
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Footer with Stats / Archive Links */}
            <div className="mt-8 flex flex-wrap gap-4 border-t border-white/5 pt-6">
                <button
                    onClick={() => setExplorerType('failed')}
                    className="glass-light px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-red-500/10 transition-colors border border-red-500/20"
                >
                    <XCircle className="w-4 h-4 text-red-500" />
                    <span className="text-sm font-bold text-gray-300">Failed Tasks</span>
                    <span className="bg-red-500/20 px-2 py-0.5 rounded text-[10px] text-red-400 font-mono">{getTasksByStatus('failed').length}</span>
                </button>

                <button
                    onClick={() => setExplorerType('archived')}
                    className="glass-light px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-amber-500/10 transition-colors border border-amber-500/20"
                >
                    <Lock className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-bold text-gray-300">Archived Tasks</span>
                    <span className="bg-amber-500/20 px-2 py-0.5 rounded text-[10px] text-amber-400 font-mono">{getTasksByStatus('archived').length}</span>
                </button>
            </div>

            {/* GATE PROTECTION DISABLED BY AGENT FOR UNRESTRICTED ACCESS */}

            {/* Artifact Viewer Modal */}
            {selectedArtifact && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" onClick={() => setSelectedArtifact(null)} />
                    <div className="relative glass rounded-2xl p-6 w-full max-w-4xl border border-white/20 glow-violet max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="text-2xl font-bold text-white mb-1">{selectedArtifact.title}</h3>
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                    <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Artifact View Optimized</span>
                                </div>
                            </div>
                            <button onClick={() => setSelectedArtifact(null)} className="text-gray-400 hover:text-white p-2 bg-white/5 rounded-lg">✕</button>
                        </div>
                        <div className="bg-[#040406] p-6 rounded-xl overflow-auto flex-1 border border-white/5">
                            <ArtifactContent content={selectedArtifact.content} />
                        </div>
                    </div>
                </div>
            )}

            {/* Custom Clarification Modal */}
            {clarifyTask && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setClarifyTask(null)} />
                    <div className="relative glass rounded-2xl p-6 w-full max-w-lg border border-amber-500/30 glow-amber shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-amber-500/10 rounded-lg">
                                    <HelpCircle className="w-6 h-6 text-amber-500" />
                                </div>
                                <h3 className="text-xl font-bold text-white">Agent Clarification</h3>
                            </div>
                            <button onClick={() => setClarifyTask(null)} className="text-gray-500 hover:text-white p-2">✕</button>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-4">
                                <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest block mb-2">Original Mission:</span>
                                    <h4 className="text-sm font-bold text-gray-200 mb-1">{clarifyTask.title}</h4>
                                    <p className="text-xs text-zinc-400 line-clamp-3">{clarifyTask.description}</p>
                                </div>

                                <div className="p-4 bg-amber-500/5 rounded-xl border border-amber-500/20">
                                    <span className="text-[10px] text-amber-500 font-bold uppercase tracking-widest block mb-2">The Agent Asks:</span>
                                    <p className="text-sm text-gray-200 italic">"{clarifyTask.result || "I need more context to proceed."}"</p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs text-gray-400 font-bold uppercase tracking-widest">Your Response:</label>
                                <textarea
                                    value={clarification}
                                    onChange={(e) => setClarification(e.target.value)}
                                    placeholder="Type your answer here..."
                                    rows={4}
                                    className="w-full p-4 bg-[#0B0B0F] border border-white/10 rounded-xl text-white text-sm focus:border-violet-500 outline-none transition-all placeholder-gray-600 resize-none"
                                    autoFocus
                                />
                            </div>

                            <button
                                onClick={handleClarifySubmit}
                                disabled={!clarification.trim()}
                                className="w-full py-4 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 disabled:opacity-50 text-white font-bold transition-all shadow-lg flex items-center justify-center gap-2"
                            >
                                <Send className="w-4 h-4" />
                                Send Clarification
                            </button>

                            <button
                                onClick={() => {
                                    handleViewArtifact(clarifyTask);
                                }}
                                className="w-full py-2 text-xs text-gray-500 hover:text-violet-400 transition-colors flex items-center justify-center gap-1"
                            >
                                <Eye className="w-3 h-3" /> View Artifact in Progress
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Spreadsheet / Explorer Modal */}
            {explorerType && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200">
                    <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" onClick={() => setExplorerType(null)} />
                    <div className="relative glass rounded-2xl w-full max-w-5xl border border-white/10 flex flex-col max-h-[85vh] shadow-[0_0_50px_-12px_rgba(139,92,246,0.3)]">
                        <div className="p-6 border-b border-white/5 flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-bold text-white capitalize">{explorerType} Tasks Repository</h3>
                                <p className="text-xs text-gray-400 mt-1">Audit log of {explorerType} operations and artifacts.</p>
                            </div>
                            <button onClick={() => setExplorerType(null)} className="text-gray-500 hover:text-white p-2 bg-white/5 rounded-lg transition-all">✕</button>
                        </div>

                        <div className="flex-1 overflow-auto p-4">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold border-b border-white/5">
                                        <th className="px-4 py-3">Task ID</th>
                                        <th className="px-4 py-3">Title</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3">Priority</th>
                                        <th className="px-4 py-3">Last Owned By</th>
                                        <th className="px-4 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm">
                                    {getTasksByStatus(explorerType).map((task) => (
                                        <tr key={task.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group">
                                            <td className="px-4 py-4 font-mono text-[10px] text-zinc-500">#{task.id.slice(0, 8)}</td>
                                            <td className="px-4 py-4 font-medium text-gray-200">{task.title}</td>
                                            <td className="px-4 py-4">
                                                <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${task.status === 'failed' ? 'text-red-400 bg-red-400/10' : 'text-amber-400 bg-amber-400/10'
                                                    }`}>
                                                    {task.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className="text-[10px] font-mono text-zinc-400 capitalize">{task.priority}</span>
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className="text-[10px] font-mono text-zinc-500 uppercase">{task.claimed_by || task.assigned_to || 'N/A'}</span>
                                            </td>
                                            <td className="px-4 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {task.artifact_url && (
                                                        <button
                                                            onClick={() => handleViewArtifact(task)}
                                                            className="p-2 text-violet-400 hover:bg-violet-400/10 rounded-lg transition-all"
                                                            title="View Artifact"
                                                        >
                                                            <Eye className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    {/* Restore Button */}
                                                    <button
                                                        onClick={() => updateTaskStatus(task.id, 'pending')}
                                                        className="p-2 text-cyan-400 hover:bg-cyan-400/10 rounded-lg transition-all"
                                                        title="Restore to Todo"
                                                    >
                                                        <Plus className="w-4 h-4 rotate-45" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {getTasksByStatus(explorerType).length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="px-4 py-16 text-center text-gray-500">
                                                <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                                <p>No tasks found in {explorerType} category.</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="p-4 border-t border-white/5 bg-white/[0.02] flex justify-between items-center text-[10px] text-zinc-500 font-mono uppercase">
                            <span>Total Items: {getTasksByStatus(explorerType).length}</span>
                            <span>Trinity Symphony Task Explorer v1.2</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Task Detail Modal */}
            {selectedTask && (
                <TaskDetailModal
                    task={selectedTask}
                    isOpen={!!selectedTask}
                    onClose={() => setSelectedTask(null)}
                    onViewArtifact={handleViewArtifact}
                    onArchive={archiveTask}
                />
            )}
        </div>
    );
}
