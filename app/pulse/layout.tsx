'use client';

import { Sidebar } from '@/components/Sidebar';
import { BottomNav } from '@/components/BottomNav';
import { ShareModal } from '@/components/modals/ShareModal';
import { useState } from 'react';
import { usePathname } from 'next/navigation';

export default function PulseLayout({ children }: { children: React.ReactNode }) {
    // Sidebar state only relevant for desktop expand/collapse in future if needed
    // For now, it's always open on desktop, hidden on mobile
    const [showShareModal, setShowShareModal] = useState(false);
    const pathname = usePathname();

    const getTitle = () => {
        if (pathname.includes('/dashboard')) return 'Dashboard';
        if (pathname.includes('/agents')) return 'Agents';
        if (pathname.includes('/tasks')) return 'Tasks';
        if (pathname.includes('/artifacts')) return 'Artifacts';
        if (pathname.includes('/mission')) return 'New Mission';
        if (pathname.includes('/directives')) return 'Ideas'; // Mapped
        if (pathname.includes('/sandbox')) return 'Apps'; // Mapped
        return 'Trinity Controller';
    };

    return (
        <div className="min-h-screen bg-obsidian-base relative">
            {/* Desktop Sidebar (Hidden on Mobile) */}
            <div className="hidden lg:block">
                <Sidebar isOpen={true} onClose={() => { }} />
            </div>

            {/* Mobile Bottom Nav (Hidden on Desktop) */}
            <div className="lg:hidden">
                <BottomNav />
            </div>

            {/* Main Content Area */}
            <div className="lg:ml-64 min-h-screen flex flex-col pb-20 lg:pb-0">
                {/* Top Bar */}
                <header className="sticky top-0 z-30 bg-obsidian-base/80 backdrop-blur-md border-b border-white/10">
                    <div className="flex items-center justify-between px-4 lg:px-8 py-4">
                        {/* Page Title (Visible on both mobile/desktop for context) */}
                        <div className="block">
                            <h2 className="text-xl lg:text-2xl font-bold bg-gradient-to-r from-violet-400 via-cyan-400 to-violet-400 bg-clip-text text-transparent">
                                {getTitle()}
                            </h2>
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 p-4 lg:p-10">
                    {children}
                </main>
            </div>

            <ShareModal
                isOpen={showShareModal}
                onClose={() => setShowShareModal(false)}
            />
        </div>
    );
}
