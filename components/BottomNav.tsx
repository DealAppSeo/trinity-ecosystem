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
        { path: '/pulse/dashboard', icon: Heart, label: 'Health' },
        { path: '/pulse/tasks', icon: Zap, label: 'Active' },
        { path: '/pulse/directives', icon: Lightbulb, label: 'Ideas' },
        { path: '/pulse/agents', icon: Users, label: 'Agents' },
        { path: '/pulse/sandbox', icon: LayoutGrid, label: 'Apps' },
    ];

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#0B0B0F]/90 backdrop-blur-xl border-t border-white/10 lg:hidden pb-safe">
            <div className="flex justify-around items-center h-16 px-2">
                {navItems.map((item) => {
                    const isActive = pathname === item.path;
                    const Icon = item.icon;

                    return (
                        <Link
                            key={item.path}
                            href={item.path}
                            className={`
                                flex flex-col items-center justify-center w-full h-full gap-1
                                transition-all duration-200
                                ${isActive
                                    ? 'text-cyan-400'
                                    : 'text-gray-500 hover:text-gray-300'
                                }
                            `}
                        >
                            <div className={`p-1 rounded-full ${isActive ? 'bg-cyan-400/10' : ''}`}>
                                <Icon className={`w-5 h-5 ${isActive ? 'fill-current' : ''}`} />
                            </div>
                            <span className="text-[10px] font-medium tracking-wide">
                                {item.label}
                            </span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
