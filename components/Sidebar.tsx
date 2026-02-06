import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { isMockMode } from '@/lib/supabase';
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
    LayoutGrid,
    LogOut,
    ShieldCheck
} from 'lucide-react';

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const [role, setRole] = useState<'founder' | 'guest' | 'verified'>('guest');
    const [versionSuffix, setVersionSuffix] = useState('');

    useEffect(() => {
        if (isMockMode) {
            setVersionSuffix(' (M)');
        }
    }, []);

    useEffect(() => {
        const roleMatch = document.cookie.match(/trinity_role=([^;]+)/);
        if (roleMatch) {
            setRole(roleMatch[1] as any);
        } else {
            const localRole = localStorage.getItem('trinity_role');
            if (localRole) setRole(localRole as any);
        }
    }, []);

    const handleLogout = () => {
        // Clear Cookies
        document.cookie = "trinity_access=; Path=/; Max-Age=0; SameSite=Lax";
        document.cookie = "trinity_role=; Path=/; Max-Age=0; SameSite=Lax";

        // Clear LocalStorage
        localStorage.removeItem('trinity_role');
        localStorage.removeItem('trinity_access');

        // Redirect to Join Gate
        router.push('/join');
    };

    { path: '/pulse/conductor', icon: Home, label: 'Conductor' },
    { path: '/pulse/dashboard', icon: Activity, label: 'Dashboard' },
    { path: '/pulse/tasks', icon: CheckSquare, label: 'Tasks' },
    { path: '/pulse/directives', icon: Lightbulb, label: 'Directives' },
    { path: '/pulse/agents', icon: Users, label: 'Agents' },
    { path: '/pulse/sandbox', icon: LayoutGrid, label: 'Apps' },
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
                    <nav className="flex-1 space-y-2 overflow-y-auto scrollbar-hide">
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

                    {/* Footer Info & Logout */}
                    <div className="mt-auto pt-6 space-y-4">
                        <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <ShieldCheck className={role === 'founder' ? 'text-emerald-400' : 'text-violet-400'} size={14} />
                                    <span className="text-[10px] uppercase font-bold tracking-widest text-gray-400 truncate max-w-[100px]">
                                        {role}
                                    </span>
                                </div>
                                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                            </div>
                            <p className="text-[10px] text-gray-500 font-mono">Trinity OS v8.1.3{versionSuffix}</p>
                        </div>

                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors font-medium border border-transparent hover:border-red-500/20"
                        >
                            <LogOut className="w-5 h-5" />
                            <span>Logout</span>
                        </button>
                    </div>
                </div>
            </aside>
        </>
    );
}
