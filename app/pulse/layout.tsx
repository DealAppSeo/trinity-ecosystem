'use client';

import { Sidebar } from '@/components/Sidebar';
import { BottomNav } from '@/components/BottomNav';
import { ShareModal } from '@/components/modals/ShareModal';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Mic } from 'lucide-react';
import { Button } from '@/components/ui/Button';

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

                        {/* Actions (Voice / Share) */}
                        <div className="flex items-center gap-3">
                            <button className="flex items-center justify-center w-10 h-10 rounded-full bg-accent-violet/10 hover:bg-accent-violet/20 text-accent-violet transition-colors">
                                <Mic className="w-5 h-5" />
                            </button>

                            <Button
                                size="sm"
                                onClick={() => setShowShareModal(true)}
                                className="hidden sm:flex bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-glow-violet border-none"
                            >
                                Share & Earn
                            </Button>

                            {/* Mobile Share Icon (Optional but helpful for consistency if Button is hidden) */}
                            <button
                                onClick={() => setShowShareModal(true)}
                                className="sm:hidden flex items-center justify-center w-10 h-10 rounded-full bg-accent-violet/10 hover:bg-accent-violet/20 text-accent-violet transition-colors"
                            >
                                <ShareModal isOpen={false} onClose={() => { }} /> {/* Just for icon reference if needed, but we'll use a lucide icon */}
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-share-2"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" x2="15.42" y1="13.51" y2="17.49" /><line x1="15.41" x2="8.59" y1="6.51" y2="10.49" /></svg>
                            </button>
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
