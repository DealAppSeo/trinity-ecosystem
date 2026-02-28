'use client';

import { Activity, Shield, Zap, Database, Cpu, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SquadHealthCardProps {
    squadId: 'ORCHESTRATION' | 'ALPHA' | 'BETA' | 'GAMMA';
    agents: any[];
    onClick?: () => void;
}

const SQUAD_METADATA: Record<string, any> = {
    ORCHESTRATION: {
        label: 'Orchestration',
        icon: Cpu,
        color: 'text-violet-400',
        bg: 'bg-violet-500/10',
        border: 'border-violet-500/30',
        description: 'Global routing & consensus'
    },
    ALPHA: {
        label: 'Alpha (Security)',
        icon: Shield,
        color: 'text-blue-400',
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/30',
        description: 'Ethical gating & safety'
    },
    BETA: {
        label: 'Beta (Design)',
        icon: Activity,
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/30',
        description: 'UX & empathy metrics'
    },
    GAMMA: {
        label: 'Gamma (Build)',
        icon: Zap,
        color: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        description: 'Code & performance'
    }
};

export function SquadHealthCard({ squadId, agents, onClick }: SquadHealthCardProps) {
    const meta = SQUAD_METADATA[squadId];
    const Icon = meta.icon;

    const squadAgents = agents.filter(a => (a.group_name === squadId || a.group_id === squadId));
    const onlineCount = squadAgents.filter(a => ['online', 'active', 'green', 'blue', 'amber'].includes(a.status)).length;
    const avgRep = squadAgents.length > 0 
        ? squadAgents.reduce((sum, a) => sum + (a.reputation_score || 0), 0) / squadAgents.length 
        : 0;

    const currentActivity = squadAgents.find(a => (a as any).current_task_summary || a.currentTask)?.current_task_summary 
        || squadAgents.find(a => a.currentTask)?.currentTask?.title 
        || 'Squad on Standby';

    return (
        <div 
            onClick={onClick}
            className={cn(
                "group relative p-6 rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden",
                meta.border,
                "bg-[#0B0B0F]/80 backdrop-blur-xl hover:shadow-[0_0_30px_rgba(0,0,0,0.3)] hover:scale-[1.02]"
            )}
        >
            <div className="flex justify-between items-start mb-6">
                <div className={cn("p-3 rounded-xl", meta.bg)}>
                    <Icon className={cn("w-6 h-6", meta.color)} />
                </div>
                <div className="text-right">
                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Health</div>
                    <div className={cn("text-lg font-bold font-mono", onlineCount === squadAgents.length ? "text-green-400" : "text-amber-400")}>
                        {onlineCount}/{squadAgents.length} ACTIVE
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                <div>
                    <h3 className="text-xl font-bold text-white tracking-tight">{meta.label}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{meta.description}</p>
                </div>

                <div className="pt-4 border-t border-white/5">
                    <div className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-2">Current Activity</div>
                    <p className="text-sm text-gray-300 font-medium line-clamp-2 leading-relaxed min-h-[40px]">
                        {currentActivity}
                    </p>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-white/5 text-[10px] font-bold uppercase tracking-widest">
                    <span className="text-gray-600">Avg Rep: <span className={meta.color}>{avgRep.toFixed(1)}</span></span>
                    <span className="text-violet-400 group-hover:translate-x-1 transition-transform flex items-center gap-1">
                        Details <ChevronRight className="w-3 h-3" />
                    </span>
                </div>
            </div>

            {/* Glowing Gradient Background */}
            <div className={cn(
                "absolute -right-8 -bottom-8 w-32 h-32 rounded-full blur-[60px] opacity-10 transition-opacity group-hover:opacity-20",
                meta.bg.replace('/10', '/50')
            )} />
        </div>
    );
}
