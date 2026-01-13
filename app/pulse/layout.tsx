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
            <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            {/* Main Content Area */}
            <div className="lg:ml-64 min-h-screen flex flex-col">
                {/* Top Bar */}
                <header className="sticky top-0 z-30 bg-obsidian-base/80 backdrop-blur-md border-b border-white/10">
                    <div className="flex items-center justify-between px-4 lg:px-8 py-4">
                        {/* Mobile Menu Button  */}
                        <button
                            className="lg:hidden p-2 text-zinc-400 hover:text-white transition-colors"
                            onClick={() => setSidebarOpen(true)}
                        >
                            <Menu className="w-6 h-6" />
                        </button>

                        {/* Page Title */}
                        <div className="hidden lg:block">
                            <h2 className="text-2xl font-bold bg-gradient-to-r from-violet-400 via-cyan-400 to-violet-400 bg-clip-text text-transparent">
                                {getTitle()}
                            </h2>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                            {/* Share button removed per user request (Redundant with Header) */}
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
