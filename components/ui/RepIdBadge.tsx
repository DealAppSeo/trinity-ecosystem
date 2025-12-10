import { cn } from '@/lib/utils';

interface RepIdBadgeProps {
    score: number;
    showLabel?: boolean;
    className?: string;
}

export function RepIdBadge({ score, showLabel = false, className }: RepIdBadgeProps) {
    // Determine tier based on score
    const getTier = (s: number) => {
        if (s >= 95) return 'gold';
        if (s >= 85) return 'high';
        return 'mid';
    };

    const tier = getTier(score);

    const tierClasses = {
        gold: 'text-gold border-gold/30 shadow-[0_0_12px_rgba(245,158,11,0.2)]',
        high: 'text-accent-violet border-accent-violet/30',
        mid: 'text-text-secondary border-obsidian-border',
    };

    return (
        <span
            className={cn(
                'font-mono text-sm px-2 py-0.5 rounded bg-obsidian-elevated border',
                tierClasses[tier],
                className
            )}
        >
            {showLabel && 'RepID '}
            {score}
        </span>
    );
}
