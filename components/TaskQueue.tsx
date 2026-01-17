'use client';

import { Card } from '@/components/ui/Card';
import { TrinityTask } from '@/types';
import { Button } from '@/components/ui/Button';

interface TaskQueueProps {
    tasks: TrinityTask[];
    onAddTask?: () => void;
}

export function TaskQueue({ tasks, onAddTask }: TaskQueueProps) {
    return (
        <Card className="h-full flex flex-col p-4 bg-obsidian-section" elevated>
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-text-primary flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-accent-violet animate-pulse" />
                    Task Queue
                </h3>
                {onAddTask && (
                    <Button size="sm" variant="ghost" onClick={onAddTask} className="h-8 px-2">
                        +
                    </Button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {tasks.length === 0 ? (
                    <div className="text-center py-8 text-text-muted text-sm">
                        Queue empty. System idle.
                    </div>
                ) : (
                    tasks.map(task => (
                        <div key={task.id} className="p-2 rounded bg-obsidian-surface border border-obsidian-border hover:border-obsidian-border-focus transition-colors">
                            <div className="flex justify-between items-center mb-1">
                                <span className="font-medium text-xs text-text-primary line-clamp-1 flex-1 mr-2">{task.title}</span>
                                <span className={`text-[9px] px-1 py-0.5 rounded font-mono ${task.priority > 7 ? 'bg-red-500/10 text-red-400' : 'bg-obsidian-base text-text-muted'
                                    }`}>
                                    P{task.priority}
                                </span>
                            </div>
                            <div className="flex justify-between items-end mt-1">
                                <div className="flex flex-col">
                                    <span className="text-[9px] text-text-muted flex items-center gap-1">
                                        {task.claimed_by ? (
                                            <>
                                                <span className="text-accent-blue">●</span> {task.claimed_by}
                                            </>
                                        ) : (
                                            <span className="italic">Unclaimed</span>
                                        )}
                                    </span>
                                    {task.verify_count !== undefined && task.verify_count > 0 && (
                                        <span className="text-[8px] text-accent-green font-mono">
                                            ✓ {task.verify_count}/2 Consensus
                                        </span>
                                    )}
                                </div>
                                <span className={`w-1.5 h-1.5 rounded-full ${task.status === 'verified' ? 'bg-accent-green shadow-[0_0_8px_#22c55e]' :
                                        task.status === 'in_progress' || task.status === 'doing' ? 'bg-status-working animate-pulse' :
                                            task.status === 'pending_clarification' ? 'bg-amber-500 animate-pulse shadow-[0_0_8px_#fbbf24]' :
                                                task.status === 'done' || task.status === 'completed' ? 'bg-cyan-500 shadow-[0_0_8px_#06b6d4]' :
                                                    'bg-obsidian-border'
                                    }`} />
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="mt-4 pt-3 border-t border-obsidian-border text-xs text-text-muted font-mono flex flex-col gap-1">
                <div className="flex justify-between">
                    <span>Pending: {tasks.filter(t => t.status === 'pending').length}</span>
                    <span>Active: {tasks.filter(t => t.status === 'in_progress').length}</span>
                </div>
                <div className="flex justify-between text-amber-500 font-bold">
                    <span>Clarify: {tasks.filter(t => t.status === 'pending_clarification').length}</span>
                    <span>Done: {tasks.filter(t => t.status === 'done').length}</span>
                </div>
            </div>
        </Card>
    );
}
