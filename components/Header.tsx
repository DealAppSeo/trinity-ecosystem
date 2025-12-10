import { LiveBadge } from './LiveBadge';

interface HeaderProps {
    title?: string;
    viewerCount?: number;
    showLive?: boolean;
    rightContent?: React.ReactNode;
}

export function Header({
    title = 'TRINITY PULSE',
    viewerCount,
    showLive = false,
    rightContent
}: HeaderProps) {
    return (
        <header className="sticky top-0 z-50 bg-obsidian-base/80 backdrop-blur-md border-b border-obsidian-border safe-top">
            <div className="flex items-center justify-between px-4 py-3">
                {/* Left: Title */}
                <h1 className="text-lg font-semibold text-text-primary tracking-tight">
                    {title}
                </h1>

                {/* Right: Live Badge + Actions */}
                <div className="flex items-center gap-3">
                    {showLive && <LiveBadge viewerCount={viewerCount} />}
                    {rightContent}
                </div>
            </div>
        </header>
    );
}
