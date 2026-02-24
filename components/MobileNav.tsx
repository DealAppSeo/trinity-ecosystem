'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Lightbulb, Users, Heart, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

export function MobileNav() {
    const pathname = usePathname();

    const navItems = [
        { name: 'Health', href: '/pulse/conductor', icon: Activity },
        { name: 'Directives', href: '/pulse/directives', icon: Lightbulb },
        { name: 'Wisdom', href: '/pulse/wisdom', icon: Users },
        { name: 'Impact', href: '/impact', icon: Heart },
        { name: 'Conductor', href: '/pulse/conductor', icon: Zap },
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
