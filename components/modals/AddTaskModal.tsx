'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { AgentRegistryRecord } from '@/lib/agent/types';

interface AddTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    availableAgents: AgentRegistryRecord[];
}

export function AddTaskModal({ isOpen, onClose, availableAgents }: AddTaskModalProps) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState(5);
    const [assignedAgent, setAssignedAgent] = useState('');
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const res = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    description,
                    priority,
                    agent_assigned: assignedAgent || null,
                    task_type: 'general'
                })
            });

            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Failed to create task');

            onClose();
            // Reset form
            setTitle('');
            setDescription('');
            setPriority(5);
            setAssignedAgent('');

        } catch (err: any) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-obsidian-elevated border border-obsidian-border rounded-xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-bold text-text-primary mb-4">Inject New Task</h3>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-1">Task Title</label>
                        <input
                            required
                            className="w-full bg-obsidian-surface border border-obsidian-border rounded-md px-3 py-2 text-text-primary focus:outline-none focus:border-accent-violet"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. Optimize Database Indexes"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-1">Description</label>
                        <textarea
                            className="w-full bg-obsidian-surface border border-obsidian-border rounded-md px-3 py-2 text-text-primary focus:outline-none focus:border-accent-violet h-24 resize-none"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Detailed instructions for the agent..."
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-1">Priority (1-10)</label>
                        <div className="flex items-center gap-4">
                            <input
                                type="range"
                                min="1"
                                max="10"
                                className="flex-1 accent-accent-violet"
                                value={priority}
                                onChange={(e) => setPriority(parseInt(e.target.value))}
                            />
                            <span className="font-mono text-accent-violet w-8 text-center">{priority}</span>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-1">Assign Agent (Optional)</label>
                        <select
                            className="w-full bg-obsidian-surface border border-obsidian-border rounded-md px-3 py-2 text-text-primary focus:outline-none focus:border-accent-violet appearance-none"
                            value={assignedAgent}
                            onChange={(e) => setAssignedAgent(e.target.value)}
                        >
                            <option value="">Auto-Route (System Decide)</option>
                            {availableAgents.map(agent => (
                                <option key={agent.agent_name} value={agent.agent_name}>
                                    {agent.agent_name} ({agent.status})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" className="flex-1" disabled={loading}>
                            {loading ? 'Injecting...' : 'Inject Task'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
