'use client';

import { Sidebar } from '@/components/Sidebar';
import { BottomNav } from '@/components/BottomNav';
import { usePathname } from 'next/navigation';

export default function PulseLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    return (
        <div className="min-h-screen bg-obsidian-base relative">
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
                {/* ROOT NavBar (in app/layout.tsx) handles the top bar now */}

                {/* Page Content */}
                <main className="flex-1 p-4 lg:p-10">
                    {children}
                </main>
            </div>
        </div>
    );
}
