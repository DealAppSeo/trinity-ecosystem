'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Lightbulb, Users, Grid, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

export function MobileNav() {
    const pathname = usePathname();

    const navItems = [
        { name: 'Health', href: '/pulse/conductor', icon: Activity },
        { name: 'Active', href: '/pulse/conductor?view=active', icon: Zap }, // Mapping "Active" to conductor for now
        { name: 'Ideas', href: '/pulse/wisdom', icon: Lightbulb }, // Mapping "Ideas" to Wisdom/Governance
        { name: 'Agents', href: '/pulse/conductor?view=agents', icon: Users },
        { name: 'Apps', href: '/impact', icon: Grid }, // Mapping "Apps" to Landing for now or a new apps page
    ];

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-t border-white/10 pb-safe md:hidden">
            <nav className="flex justify-around items-center h-16">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;

                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                                "flex flex-col items-center justify-center w-full h-full space-y-1",
                                isActive
                                    ? "text-blue-400"
                                    : "text-gray-500 hover:text-gray-300"
                            )}
                        >
                            <Icon className="w-5 h-5" />
                            <span className="text-[10px] font-medium">{item.name}</span>
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
}
