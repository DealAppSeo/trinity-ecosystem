'use client';

import { Sidebar } from '@/components/Sidebar';
import { ShareModal } from '@/components/modals/ShareModal';
import { useState } from 'react';
import { Share2, Menu, X } from 'lucide-react';
import { usePathname } from 'next/navigation';

export default function PulseLayout({ children }: { children: React.ReactNode }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const pathname = usePathname();

    // Derive title from pathname
    const getTitle = () => {
        if (pathname.includes('/dashboard')) return 'Dashboard';
        if (pathname.includes('/agents')) return 'Agents';
        if (pathname.includes('/tasks')) return 'Tasks';
        if (pathname.includes('/artifacts')) return 'Artifacts';
        if (pathname.includes('/mission')) return 'New Mission';
        return 'Trinity Controller';
    };

    return (
        <div className="min-h-screen bg-obsidian-base relative">
            <Sidebar />

            {/* Main Content Area */}
            <div className="lg:ml-64 min-h-screen flex flex-col">
                {/* Top Bar */}
                <header className="sticky top-0 z-30 bg-obsidian-base/80 backdrop-blur-md border-b border-white/10">
                    <div className="flex items-center justify-between px-4 lg:px-8 py-4">
                        {/* Mobile Menu Button - We'd need to pass setSidebarOpen context down if we want this to work perfectly, 
                            but for now sidebar has its own state. 
                            Ideally Sidebar lifts state up or we use a context. 
                            For MVP, hiding mobile trigger here since Sidebar handles its own mobile overlay check. 
                            Actually, Sidebar is fixed. We need a way to open it on mobile.
                            Refactor Sidebar to accept isOpen prop later or rely on desktop-first for this generic layout.
                        */}
                        <div className="lg:hidden">
                            {/* Placeholder for mobile trigger if we lift state */}
                        </div>

                        {/* Page Title */}
                        <div className="hidden lg:block">
                            <h2 className="text-2xl font-bold bg-gradient-to-r from-violet-400 via-cyan-400 to-violet-400 bg-clip-text text-transparent">
                                {getTitle()}
                            </h2>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowShareModal(true)}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-violet-500 to-cyan-500 hover:from-violet-600 hover:to-cyan-600 transition-all duration-200 shadow-glow-violet text-white"
                            >
                                <Share2 className="w-4 h-4" />
                                <span className="hidden sm:inline font-medium">Share</span>
                            </button>
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 p-6 lg:p-10">
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
