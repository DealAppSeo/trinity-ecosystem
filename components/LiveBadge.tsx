import { cn } from '@/lib/utils';

interface LiveBadgeProps {
    viewerCount?: number;
}

export function LiveBadge({ viewerCount }: LiveBadgeProps) {
    return (
        <div className="flex items-center gap-3">
            {/* Live Indicator - Green if viewerCount > 0 (Active Connection) */}
            <div className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded transition-colors",
                (viewerCount && viewerCount > 0) ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
            )}>
                <span className={cn(
                    "w-2 h-2 rounded-full animate-pulse-slow",
                    (viewerCount && viewerCount > 0) ? "bg-green-500" : "bg-red-500"
                )} />
                <span className="text-xs font-medium">LIVE</span>
            </div>

            {/* Viewer Count */}
            {viewerCount !== undefined && viewerCount > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-obsidian-elevated rounded">
                    <svg
                        className="w-3.5 h-3.5 text-text-muted"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                    </svg>
                    <span className="text-xs text-text-secondary">{viewerCount}</span>
                </div>
            )}
        </div>
    );
}
