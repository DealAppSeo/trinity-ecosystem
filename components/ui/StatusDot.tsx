import { cn } from '@/lib/utils';
import { AgentStatus } from '@/types';

interface StatusDotProps {
    status: AgentStatus;
    size?: 'sm' | 'md';
    className?: string;
}

export function StatusDot({ status, size = 'md', className }: StatusDotProps) {
    const sizeClasses = {
        sm: 'w-1.5 h-1.5',
        md: 'w-2 h-2',
    };

    const statusClasses = {
        online: 'bg-status-online shadow-[0_0_8px_rgba(34,197,94,0.5)]',
        working: 'bg-status-working animate-pulse-slow shadow-[0_0_8px_rgba(245,158,11,0.5)]',
        stale: 'bg-status-working/70', // Amber but dimmer
        offline: 'bg-status-offline',
        error: 'bg-status-error shadow-[0_0_8px_rgba(239,68,68,0.5)]',
    };

    return (
        <span
            className={cn(
                'rounded-full inline-block',
                sizeClasses[size],
                statusClasses[status],
                className
            )}
        />
    );
}
