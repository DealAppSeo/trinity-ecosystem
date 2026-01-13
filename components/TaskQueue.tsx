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
                            <div className="flex justify-between items-end">
                                <span className="text-[10px] text-text-muted">{task.assigned_agent || '-'}</span>
                                <span className={`w-1.5 h-1.5 rounded-full ${task.status === 'in_progress' ? 'bg-status-working animate-pulse' : 'bg-obsidian-border'
                                    }`} />
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="mt-4 pt-3 border-t border-obsidian-border text-xs text-text-muted font-mono flex justify-between">
                <span>Pending: {tasks.filter(t => t.status === 'pending').length}</span>
                <span>Active: {tasks.filter(t => t.status === 'in_progress').length}</span>
            </div>
        </Card>
    );
}
