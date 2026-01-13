'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { Plus, Clock, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTrinityController } from '@/hooks/useTrinityController';
import { TaskRecord } from '@/lib/agent/types';

export default function TasksPage() {
    const { tasks: initialTasks, refresh } = useTrinityController();
    const [tasks, setTasks] = useState<TaskRecord[]>([]);
    const [newTask, setNewTask] = useState({ title: '', description: '', priority: 'medium' });
    const [showNewTaskForm, setShowNewTaskForm] = useState(false);

    // Sync with controller data initially, but allow local optimization updates
    useEffect(() => {
        if (initialTasks) setTasks(initialTasks);
    }, [initialTasks]);

    const createTask = async () => {
        if (!newTask.title.trim()) return;

        try {
            const { data, error } = await supabase
                .from('trinity_tasks')
                .insert([{
                    title: newTask.title,
                    description: newTask.description,
                    priority: newTask.priority,
                    status: 'pending', // map 'todo' to 'pending' if schema differs, assuming 'pending' in our DB
                    created_at: new Date().toISOString()
                }])
                .select()
                .single();

            if (error) throw error;

            if (data) {
                setTasks([data as unknown as TaskRecord, ...tasks]);
                setNewTask({ title: '', description: '', priority: 'medium' });
                setShowNewTaskForm(false);
                refresh(); // Sync global state
            }
        } catch (error) {
            console.error('Error creating task:', error);
        }
    };

    const updateTaskStatus = async (taskId: string, newStatus: string) => {
        // status mapping: kanban cols (todo, in-progress, done, failed) -> db status
        // assume db uses: pending, in_progress, completed, failed
        let dbStatus = newStatus;
        if (newStatus === 'todo') dbStatus = 'pending';
        if (newStatus === 'done') dbStatus = 'completed';
        if (newStatus === 'in-progress') dbStatus = 'in_progress';

        // Optimistic Update
        setTasks(tasks.map((t) => (t.id === taskId ? { ...t, status: dbStatus } : t)));

        try {
            const { error } = await supabase
                .from('trinity_tasks')
                .update({ status: dbStatus })
                .eq('id', taskId);

            if (error) throw error;
            refresh();
        } catch (error) {
            console.error('Error updating task:', error);
            refresh(); // Revert on error
        }
    };

    const deleteTask = async (taskId: string) => {
        if (!confirm('Are you sure you want to delete this task?')) return;

        // Optimistic Delete
        setTasks(tasks.filter((t) => t.id !== taskId));

        try {
            const { error } = await supabase.from('trinity_tasks').delete().eq('id', taskId);
            if (error) throw error;
            refresh();
        } catch (error) {
            console.error('Error deleting task:', error);
            refresh();
        }
    };

    const getTasksByStatus = (status: string) => {
        // Map UI status to DB status
        let dbStatus = [status];
        if (status === 'todo') dbStatus = ['pending'];
        if (status === 'in-progress') dbStatus = ['in_progress', 'running'];
        if (status === 'done') dbStatus = ['completed', 'success'];

        return tasks.filter((task) => dbStatus.includes(task.status));
    };

    const getPriorityColor = (priority: any) => {
        let p = 'medium';

        // Handle Number Priority (Legacy/Agent Schema: 1-100)
        if (typeof priority === 'number') {
            if (priority >= 70) p = 'high';
            else if (priority >= 30) p = 'medium';
            else p = 'low';
        } else if (typeof priority === 'string') {
            p = (priority || 'medium').toLowerCase();
        }

        switch (p) {
            case 'high':
            case 'critical':
                return 'border-red-500/50 bg-red-500/10';
            case 'medium':
                return 'border-yellow-500/50 bg-yellow-500/10';
            case 'low':
                return 'border-blue-500/50 bg-blue-500/10';
            default:
                return 'border-gray-500/50 bg-gray-500/10';
        }
    };

    const columns = [
        { id: 'todo', title: 'To Do', icon: Clock, color: 'violet' },
        { id: 'in-progress', title: 'Running', icon: AlertCircle, color: 'cyan' }, // Changed title to Running to match agent context
        { id: 'done', title: 'Done', icon: CheckCircle, color: 'green' },
        { id: 'failed', title: 'Failed', icon: XCircle, color: 'red' },
    ];

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold mb-2">Mission Tasks</h2>
                    <p className="text-gray-400 text-sm">Manage and track your swarm's objectives</p>
                </div>
                <button
                    onClick={() => setShowNewTaskForm(!showNewTaskForm)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-violet-500 to-cyan-500 hover:from-violet-600 hover:to-cyan-600 transition-all duration-200 glow-violet shadow-lg shadow-violet-500/20"
                >
                    <Plus className="w-5 h-5" />
                    <span className="font-medium">New Task</span>
                </button>
            </div>

            {/* New Task Form - Design Port */}
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
                                className="px-4 py-2 glass-light rounded-lg border border-white/10 focus:border-violet-500/50 outline-none transition-colors text-gray-200 bg-[#0B0B0F]" // Added bg color for dropdown visibility
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
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 overflow-x-auto pb-4">
                {columns.map((column) => {
                    const Icon = column.icon;
                    const columnTasks = getTasksByStatus(column.id);

                    return (
                        <div key={column.id} className="glass rounded-xl p-4 border border-white/10 min-w-[280px]">
                            <div className="flex items-center gap-2 mb-4">
                                {/* Lucide icons don't support dynamic color classes like text-${color}-400 in JIT if not safe-listed, using style or explicit classes */}
                                {/* Mapping colors explicitly */}
                                <div className={`p-2 rounded-lg bg-${column.color}-500/10`}>
                                    <Icon className={`w-5 h-5 text-${column.color}-400`} style={{ color: column.id === 'todo' ? '#a78bfa' : column.id === 'in-progress' ? '#22d3ee' : column.id === 'done' ? '#4ade80' : '#f87171' }} />
                                </div>
                                <h3 className="font-bold">{column.title}</h3>
                                <span className="ml-auto text-xs font-mono bg-white/5 px-2 py-1 rounded-md text-gray-400">{columnTasks.length}</span>
                            </div>

                            <div
                                className="space-y-3 min-h-[200px]"
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
                                            className={`glass-light rounded-lg p-4 border ${getPriorityColor(task.priority)} hover:scale-[1.02] transition-all duration-200 cursor-grab active:cursor-grabbing shadow-lg`}
                                            draggable
                                            onDragStart={(e) => e.dataTransfer.setData('taskId', task.id)}
                                        >
                                            <div className="mb-3">
                                                <h4 className="font-bold text-sm mb-1 text-white leading-tight">{task.title}</h4>
                                                {task.description && (
                                                    <p className="text-xs text-gray-400 line-clamp-2">{task.description}</p>
                                                )}
                                            </div>

                                            <div className="flex items-center justify-between pt-2 border-t border-white/5">
                                                <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${task.priority === 'high' ? 'text-red-400 bg-red-400/10' :
                                                    task.priority === 'low' ? 'text-blue-400 bg-blue-400/10' :
                                                        'text-yellow-400 bg-yellow-400/10'
                                                    }`}>
                                                    {task.priority || 'MEDIUM'}
                                                </span>

                                                <div className="flex items-center gap-2">
                                                    {task.assigned_to && (
                                                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-white/10" title={`Assigned to ${task.assigned_to}`}>
                                                            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-[8px] font-bold text-white shadow-sm">
                                                                {task.assigned_to.replace('trinity-', '')[0].toUpperCase()}
                                                            </div>
                                                            <span className="text-[10px] font-mono text-gray-300">
                                                                {task.assigned_to.replace('trinity-', '').toUpperCase()}
                                                            </span>
                                                        </div>
                                                    )}
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}
                                                        className="text-gray-600 hover:text-red-400 transition-colors p-1"
                                                    >
                                                        <XCircle className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
