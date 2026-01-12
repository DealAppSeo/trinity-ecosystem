'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Mic, Activity, Layers, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

export function NavBar() {
    const pathname = usePathname();

    const navItems = [
        { name: 'Dashboard', href: '/pulse/conductor' },
        { name: 'Governance', href: '/pulse/wisdom' },
        { name: 'Public View', href: '/pulse/watch' },
    ];

    return (
        <header className="fixed top-0 left-0 right-0 z-50 bg-obsidian-surface/80 backdrop-blur-md border-b border-white/5">
            <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                {/* Logo / Brand */}
                <Link href="/" className="flex items-center gap-2 group">
                    <div className="w-8 h-8 rounded-lg bg-accent-violet flex items-center justify-center shadow-glow-violet group-hover:scale-105 transition-transform">
                        <Activity className="w-5 h-5 text-white" />
                    </div>
                    <span className="font-display font-bold text-xl text-text-primary tracking-tight">
                        Founders App
                    </span>
                </Link>

                {/* Desktop Navigation */}
                <nav className="hidden md:flex items-center gap-8">
                    {navItems.map((item) => (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                                "text-sm font-medium transition-colors hover:text-accent-violet",
                                pathname === item.href ? "text-accent-violet" : "text-text-secondary"
                            )}
                        >
                            {item.name}
                        </Link>
                    ))}
                </nav>

                {/* Actions (Voice / Profile) */}
                <div className="flex items-center gap-4">
                    {/* Voice Mode Toggle (Placeholder for Voice First) */}
                    <button className="flex items-center justify-center w-10 h-10 rounded-full bg-accent-violet/10 hover:bg-accent-violet/20 text-accent-violet transition-colors">
                        <Mic className="w-5 h-5" />
                    </button>

                    <Link href="/join">
                        <Button size="sm" variant="outline" className="hidden sm:flex border-accent-violet/50 text-accent-violet hover:bg-accent-violet/10">
                            Connect
                        </Button>
                    </Link>
                </div>
            </div>
        </header>
    );
}
