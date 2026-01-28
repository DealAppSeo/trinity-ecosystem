'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Heart,
    Zap,
    Lightbulb,
    Users,
    Grid,
    LayoutGrid
} from 'lucide-react';

export function BottomNav() {
    const pathname = usePathname();

    const navItems = [
        { path: '/pulse/dashboard', icon: Heart, label: 'Health', color: 'text-emerald-400', glow: 'bg-emerald-400/20' },
        { path: '/pulse/conductor', icon: Zap, label: 'Control', color: 'text-cyan-400', glow: 'bg-cyan-400/20' },
        { path: '/pulse/tasks', icon: Grid, label: 'Tasks', color: 'text-violet-400', glow: 'bg-violet-400/20' },
        { path: '/pulse/directives', icon: Lightbulb, label: 'Directives', color: 'text-amber-400', glow: 'bg-amber-400/20' },
        { path: '/pulse/agents', icon: Users, label: 'Swarm', color: 'text-blue-400', glow: 'bg-blue-400/20' },
    ];

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-t border-white/5 lg:hidden pb-safe safe-bottom">
            <div className="flex justify-around items-center h-20 px-4">
                {navItems.map((item) => {
                    const isActive = pathname === item.path;
                    const Icon = item.icon;

                    return (
                        <Link
                            key={item.path}
                            href={item.path}
                            className={`
                                flex flex-col items-center justify-center w-full h-full gap-1.5
                                transition-all duration-300
                                ${isActive ? item.color : 'text-zinc-500 hover:text-zinc-300'}
                            `}
                        >
                            <div className={`p-2 rounded-xl transition-all duration-300 ${isActive ? `${item.glow} shadow-[0_0_15px_rgba(0,0,0,0.5)] scale-110` : 'hover:bg-white/5'}`}>
                                <Icon className={`w-6 h-6 ${isActive ? 'fill-current' : ''}`} />
                            </div>
                            <span className={`text-[10px] font-bold uppercase tracking-tighter ${isActive ? 'opacity-100' : 'opacity-60'}`}>
                                {item.label}
                            </span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
