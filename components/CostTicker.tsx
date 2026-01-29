'use client';

interface CostTickerProps {
    traditional: number;
    trinity: number;
    googleStitch?: number;
}

export function CostTicker({ traditional = 847.00, trinity = 0.47, googleStitch = 0.00 }: CostTickerProps) {
    const saved = traditional - (trinity + googleStitch);
    const percentage = ((saved / traditional) * 100).toFixed(2);

    return (
        <div className="flex items-center justify-between px-4 py-3 bg-obsidian-surface border-t border-obsidian-border safe-bottom">
            <div className="flex items-center gap-3">
                <span className="text-text-muted text-sm">Today:</span>
                <span className="font-mono text-status-online font-medium">
                    +${saved.toFixed(2)}
                </span>
                <span className="text-text-muted text-xs">
                    ({percentage}% saved)
                </span>
            </div>

            <div className="text-xs text-text-muted font-mono hidden sm:block">
                ${traditional.toFixed(2)} → ${trinity.toFixed(2)} [S:${googleStitch.toFixed(2)}]
            </div>
        </div>
    );
}
