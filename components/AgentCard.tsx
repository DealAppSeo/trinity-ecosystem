'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { RepIdBadge } from '@/components/ui/RepIdBadge';
import { cn } from '@/lib/utils';
import { Agent } from '@/types';

interface AgentCardProps {
    agent: Agent;
    isConductor?: boolean;
    onAssignTask?: (agentName: string) => void;
}

export function AgentCard({ agent, isConductor = false, onAssignTask }: AgentCardProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    const isLocal = agent.agent_name === 'ANTIGRAV';

    return (
        <Card
            hoverable
            className={cn(
                'overflow-hidden',
                isExpanded && 'ring-1 ring-accent-violet/50'
            )}
            onClick={() => setIsExpanded(!isExpanded)}
        >
            {/* Collapsed View - Always Visible */}
            <div className="p-4">
                {/* Header Row */}
                <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-text-primary">
                        {agent.agent_name}
                    </span>
                    {isLocal && (
                        <span className="text-xs text-gold font-medium">★ Local</span>
                    )}
                </div>

                {/* Status Row */}
                <div className="flex items-center gap-3 mb-2">
                    {/* Unified Heartbeat Logic: 2 Minutes */}
                    <StatusDot status={
                        agent.lastHeartbeat && (Date.now() - new Date(agent.lastHeartbeat).getTime() < 120000)
                            ? 'online'
                            : 'offline'
                    } />
                    <RepIdBadge score={agent.repid_score} />
                </div>

                {/* Task Preview */}
                <p className="text-xs text-text-muted truncate">
                    {agent.current_task || 'Awaiting assignment'}
                </p>
            </div>

            {/* Expanded View - Conditional */}
            <div
                className={cn(
                    'border-t border-obsidian-border bg-obsidian-elevated overflow-hidden transition-all duration-250',
                    isExpanded ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'
                )}
            >
                <div className="p-4 bg-obsidian-elevated">
                    <h4 className="text-sm font-medium text-text-primary mb-2">
                        Current Activity
                    </h4>
                    <p className="text-sm text-text-secondary mb-4">
                        {agent.current_task || 'No active task'}
                    </p>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-2 mb-4">
                        <span className="text-xs px-2 py-1 bg-obsidian-base rounded text-text-muted">
                            {agent.platform}
                        </span>
                        <span className="text-xs px-2 py-1 bg-obsidian-base rounded font-mono text-text-muted">
                            RepID: {agent.repid_score}
                        </span>
                        {agent.role && (
                            <span className="text-xs px-2 py-1 bg-obsidian-base rounded text-text-muted">
                                {agent.role}
                            </span>
                        )}
                    </div>

                    {/* Conductor Actions */}
                    {isConductor && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onAssignTask?.(agent.agent_name);
                            }}
                            className="w-full py-2 bg-accent-violet hover:bg-accent-violet-hover rounded text-sm font-medium text-white transition-colors"
                        >
                            Assign Task
                        </button>
                    )}
                </div>
            </div>
        </Card>
    );
}
