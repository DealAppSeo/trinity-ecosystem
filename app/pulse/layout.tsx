'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { BottomNav } from '@/components/BottomNav';
import { PriorityTuner } from '@/components/modals/PriorityTuner';
import { usePathname } from 'next/navigation';

export default function PulseLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [showOnboarding, setShowOnboarding] = useState(false);

    useEffect(() => {
        // 1. Check for first-run onboarding (Disabled for Minimalist HUD)
        /*
        const hasPriority = localStorage.getItem('trinity_priority');
        if (!hasPriority) {
            setShowOnboarding(true);
        }
        */

        // 2. Telegram Theme Sync
        if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
            const tg = (window as any).Telegram.WebApp;
            tg.expand(); // Ensure full height
            
            // Sync theme
            document.documentElement.classList.toggle('dark', tg.colorScheme === 'dark');
            
            // Watch for theme changes
            tg.onEvent('themeChanged', () => {
                document.documentElement.classList.toggle('dark', tg.colorScheme === 'dark');
            });
        }
    }, []);

    return (
        <div className="min-h-screen bg-obsidian-base relative">
            {/* Onboarding Overlay */}
            {showOnboarding && (
                <PriorityTuner isFirstRun={true} onClose={() => setShowOnboarding(false)} />
            )}

            {/* Desktop Sidebar (Hidden on Mobile) */}
            <div className="hidden lg:block border-r border-white/5">
                <Sidebar isOpen={true} onClose={() => { }} />
            </div>

            {/* Mobile Bottom Nav (Hidden on Desktop) */}
            <div className="lg:hidden">
                <BottomNav />
            </div>

            {/* Main Content Area */}
            <div className="lg:ml-64 min-h-screen flex flex-col pt-16">
                {/* ROOT NavBar handles the top bar */}

                {/* Page Content */}
                <main className="flex-1 p-4 lg:p-10">
                    {children}
                </main>
            </div>
        </div>
    );
}
