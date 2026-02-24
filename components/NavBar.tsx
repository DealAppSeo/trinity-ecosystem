'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Mic, Activity, Share2, Sparkles, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { ShareModal } from './ui/ShareModal';
import { OnboardingAgent } from './ui/OnboardingAgent';
import { ZKPRepIDBadge } from './repid/ZKPRepIDBadge';
import { Button } from './ui/Button';

export function NavBar() {
    const pathname = usePathname();
    const [isShareOpen, setIsShareOpen] = useState(false);
    const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const triggerHaptic = () => {
        if (typeof window !== 'undefined' && 'vibrate' in navigator) {
            navigator.vibrate(10);
        }
    };

    // Dynamic Title Mapping
    const getPageTitle = () => {
        const isController = typeof window !== 'undefined' && window.location.hostname.startsWith('controller');

        if (pathname.includes('/dashboard')) return 'Dashboard';
        if (pathname.includes('/agents')) return 'Agents';
        if (pathname.includes('/tasks')) return 'Tasks';
        if (pathname.includes('/artifacts')) return 'Artifacts';
        if (pathname.includes('/mission')) return 'New Mission';
        if (pathname.includes('/directives')) return 'Directives';
        if (pathname.includes('/sandbox')) return 'Apps';
        if (pathname.includes('/wisdom')) return 'Wisdom';
        if (pathname.includes('/watch')) return 'Public View';
        if (pathname.includes('/join')) return 'Join the Symphony';

        if (isController && (pathname === '/' || pathname === '' || pathname === '/pulse/directives')) return 'Symphony Controller';

        return 'AI Trinity Symphony';
    };

    const isPulse = pathname?.startsWith('/pulse') || (typeof window !== 'undefined' && window.location.hostname.includes('controller'));

    return (
        <>
            <header className={cn(
                "fixed top-0 left-0 right-0 z-[100] transition-all duration-300",
                scrolled ? "bg-black/90 backdrop-blur-xl border-b border-white/10 h-16" : "bg-transparent h-20",
                isPulse ? "lg:pl-64" : ""
            )}>
                <div className="px-4 h-full flex items-center justify-between max-w-[2000px] mx-auto">
                    {/* Left: Brand + Title */}
                    <Link
                        href="/pulse/conductor"
                        onClick={triggerHaptic}
                        className="flex items-center gap-3 group"
                    >
                        {!isPulse && (
                            <motion.div
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-violet-500/20 group-hover:shadow-cyan-500/40 transition-all duration-500"
                            >
                                <Activity className="w-6 h-6 text-white" />
                            </motion.div>
                        )}

                        <div className="flex flex-col">
                            {!isPulse && (
                                <span className="text-[10px] md:text-xs font-black bg-gradient-to-r from-violet-400 via-cyan-400 to-violet-400 bg-clip-text text-transparent uppercase tracking-[0.2em] leading-none mb-1">
                                    AI Trinity Symphony
                                </span>
                            )}
                            <h1 className="text-lg md:text-xl font-bold text-white tracking-tight leading-none group-hover:text-cyan-400 transition-colors">
                                {getPageTitle()}
                            </h1>
                        </div>
                    </Link>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 sm:gap-4">
                        {/* ZKP Badge (Role Sensitive) */}
                        {isPulse && (
                            <div className="hidden lg:block scale-50 -mr-6 origin-right opacity-80 hover:opacity-100 transition-opacity">
                                <ZKPRepIDBadge agentName="Founder" minRep={100} />
                            </div>
                        )}

                        {/* Home Button */}
                        <motion.div
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                        >
                            <Link
                                href="/pulse/conductor"
                                onClick={triggerHaptic}
                                className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-all"
                                title="Home"
                            >
                                <Home className="w-5 h-5" />
                            </Link>
                        </motion.div>

                        {/* Share & Earn */}
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                                triggerHaptic();
                                setIsShareOpen(true);
                            }}
                            className="hidden lg:flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 transition-all group"
                        >
                            <Share2 className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                            <span className="text-xs font-bold uppercase tracking-wider">Share</span>
                            <div className="absolute -top-1 -right-1 w-2 h-2 bg-cyan-400 rounded-full animate-ping" />
                        </motion.button>

                        {/* Voice Mode / Onboarding Toggle */}
                        {!pathname.includes('/join') && !isPulse && (
                            <Link href="/join">
                                <Button size="sm" className="hidden md:flex px-6 shadow-glow-violet bg-violet-600 hover:bg-violet-500 text-white border-0">
                                    Join Symphony
                                </Button>
                            </Link>
                        )}

                        <motion.button
                            whileHover={{ scale: 1.1, rotate: 5 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => {
                                triggerHaptic();
                                setIsOnboardingOpen(true);
                            }}
                            className="flex items-center justify-center w-10 h-10 rounded-full bg-accent-violet/20 hover:bg-accent-violet/30 border border-accent-violet/50 text-accent-violet shadow-lg shadow-violet-500/20 transition-all"
                        >
                            <Mic className="w-5 h-5" />
                            <div className="absolute -bottom-1 w-1 h-1 bg-accent-violet rounded-full animate-bounce" />
                        </motion.button>
                    </div>
                </div>
            </header>

            {/* Modals */}
            <ShareModal
                isOpen={isShareOpen}
                onClose={() => setIsShareOpen(false)}
                referralCode="FOUNDER"
            />
            <OnboardingAgent
                isOpen={isOnboardingOpen}
                onClose={() => setIsOnboardingOpen(false)}
            />
        </>
    );
}
