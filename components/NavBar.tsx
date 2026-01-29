'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Mic, Activity, Layers, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { ShareModal } from '@/components/modals/ShareModal';

export function NavBar() {
    const pathname = usePathname();
    const [isShareOpen, setIsShareOpen] = useState(false);

    // Dynamic Title Mapping
    const getPageTitle = () => {
        const isController = typeof window !== 'undefined' && window.location.hostname.startsWith('controller');

        if (pathname.includes('/dashboard')) return 'Dashboard';
        if (pathname.includes('/agents')) return 'Agents';
        if (pathname.includes('/tasks')) return 'Tasks';
        if (pathname.includes('/artifacts')) return 'Artifacts';
        if (pathname.includes('/mission')) return 'New Mission';
        if (pathname.includes('/directives')) return 'Ideas';
        if (pathname.includes('/sandbox')) return 'Apps';
        if (pathname.includes('/wisdom')) return 'Governance';
        if (pathname.includes('/watch')) return 'Public View';
        if (pathname.includes('/join')) return 'Join the Symphony';

        if (isController && (pathname === '/' || pathname === '')) return 'Trinity Controller';
        if (pathname === '/' || pathname === '') return 'Home';

        return 'Trinity Controller';
    };

    const isPulse = pathname?.startsWith('/pulse');

    return (
        <header className={cn(
            "fixed top-0 left-0 right-0 z-[100] bg-obsidian-surface/80 backdrop-blur-md border-b border-white/5 transition-all duration-300",
            isPulse ? "lg:pl-64" : ""
        )}>
            <div className="px-4 h-16 flex items-center justify-between">
                {/* Left: Brand + Title */}
                <div className="flex items-center gap-4">
                    <Link href="/" className="flex items-center gap-2 group">
                        <div className="w-8 h-8 rounded-lg bg-accent-violet flex items-center justify-center shadow-glow-violet group-hover:scale-105 transition-transform">
                            <Activity className="w-5 h-5 text-white" />
                        </div>
                        <span className="font-display font-bold text-xl text-text-primary tracking-tight hidden sm:block">
                            Trinity
                        </span>
                    </Link>

                    <div className="h-6 w-px bg-white/10 mx-1 hidden md:block" />

                    <h1 className="text-lg md:text-xl font-bold bg-gradient-to-r from-violet-400 via-cyan-400 to-violet-400 bg-clip-text text-transparent truncate max-w-[150px] sm:max-w-none">
                        {getPageTitle()}
                    </h1>
                </div>

                {/* Desktop Navigation (REMOVED REDUNDANT LINKS) */}
                <nav className="hidden md:flex items-center gap-8">
                    {/* Centered links removed as per user request */}
                </nav>

                {/* Actions (Voice / Profile) */}
                <div className="flex items-center gap-2 sm:gap-4">
                    {/* Voice Mode Toggle */}
                    <button className="flex items-center justify-center w-10 h-10 rounded-full bg-accent-violet/10 hover:bg-accent-violet/20 text-accent-violet transition-colors">
                        <Mic className="w-5 h-5" />
                    </button>

                    <Button
                        size="sm"
                        onClick={() => setIsShareOpen(true)}
                        className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-glow-violet border-none px-3 sm:px-4"
                    >
                        <span className="hidden sm:inline">Share & Earn</span>
                        <span className="sm:hidden text-xs">Share</span>
                    </Button>
                </div>
            </div>

            <ShareModal isOpen={isShareOpen} onClose={() => setIsShareOpen(false)} />
        </header>
    );
}
