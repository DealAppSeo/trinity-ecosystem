'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Home,
    Users,
    CheckSquare,
    Package,
    PlusCircle,
    Cpu,
    Layers,
    Activity,
    Lightbulb,
    LayoutGrid
} from 'lucide-react';

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
    const pathname = usePathname();

    const navItems = [
        { path: '/pulse/dashboard', icon: Home, label: 'Dashboard' },
        { path: '/pulse/tasks', icon: CheckSquare, label: 'Tasks' },
        { path: '/pulse/directives', icon: Lightbulb, label: 'Ideas' }, // New
        { path: '/pulse/agents', icon: Users, label: 'Agents' },
        { path: '/pulse/sandbox', icon: LayoutGrid, label: 'Apps' }, // New
        { path: '/pulse/artifacts', icon: Package, label: 'Artifacts' },
        { path: '/pulse/wisdom', icon: Layers, label: 'Governance' },
        { path: '/pulse/watch', icon: Activity, label: 'Public View' },
        { path: '/pulse/mission', icon: PlusCircle, label: 'New Mission' },
    ];

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
                    onClick={onClose}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`
          fixed top-0 left-0 h-full w-64 z-50 
          bg-obsidian-base border-r border-white/10
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}
            >
                <div className="flex flex-col h-full p-6">
                    {/* Logo/Header */}
                    <div className="mb-8">
                        <Link href="/" className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center glow-violet shadow-lg shadow-violet-500/20">
                                <Cpu className="w-6 h-6 text-white" />
                            </div>
                            <h1 className="text-xl font-bold bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
                                Trinity
                            </h1>
                        </Link>
                        <p className="text-xs text-gray-400 ml-13 pl-13">Autonomous AI Swarm</p>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 space-y-2">
                        {navItems.map((item) => {
                            const isActive = pathname === item.path;
                            const Icon = item.icon;

                            return (
                                <Link
                                    key={item.path}
                                    href={item.path}
                                    onClick={onClose}
                                    className={`
                    flex items-center gap-3 px-4 py-3 rounded-lg
                    transition-all duration-200
                    ${isActive
                                            ? 'bg-violet-500/20 text-violet-300 shadow-glow-violet'
                                            : 'text-gray-400 hover:bg-white/5 hover:text-white'
                                        }
                  `}
                                >
                                    <Icon className="w-5 h-5" />
                                    <span className="font-medium">{item.label}</span>
                                </Link>
                            );
                        })}
                    </nav>

                    {/* Footer Info */}
                    <div className="bg-white/5 rounded-lg p-4 mt-4 border border-white/5">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                            <span className="text-xs text-gray-400">System Online</span>
                        </div>
                        <p className="text-xs text-gray-500">v1.0.0 • Trinity OS</p>
                    </div>
                </div>
            </aside>
        </>
    );
}
