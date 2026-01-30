'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { Toaster, toast } from 'sonner';
import { FileCode, FileText, Image, FileSpreadsheet, Share2, Download, Eye, Lock, ShieldAlert, RefreshCw, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTrinityController } from '@/hooks/useTrinityController';
import { RegistrationModal, UnlockModal } from '@/components/AccessModals';
import ArtifactContent from '@/components/ArtifactContent';

interface Artifact {
    id: string;
    title: string;
    type: 'code' | 'document' | 'design' | 'report' | 'md';
    content: string;
    agentId?: string;
    createdAt: string;
    shareCount: number;
    url?: string;
    accessLevel: string;
    creator_agent?: string;
    verified_by?: string[];
    task_status?: string;
}

export default function ArtifactsPage() {
    const [artifacts, setArtifacts] = useState<Artifact[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
    const [counts, setCounts] = useState<Record<string, number>>({ code: 0, document: 0, design: 0, report: 0 });
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState<string>('all');
    const PAGE_SIZE = 24;

    // ACCESS GATES
    const [hasRegistered, setHasRegistered] = useState(false);

    // UI STATES
    const [showRegModal, setShowRegModal] = useState(false);
    const [showUnlockModal, setShowUnlockModal] = useState(false);
    const [pendingArtifact, setPendingArtifact] = useState<Artifact | null>(null);

    // Initial Fetch (Public Data Only - Counts)
    useEffect(() => {
        fetchArtifacts(true);
        fetchTotalCounts();
        if (localStorage.getItem('trinity_registration')) {
            setHasRegistered(true);
        }
    }, []);

    const fetchTotalCounts = async () => {
        try {
            const types = ['code', 'document', 'design', 'report'];
            const newCounts: Record<string, number> = { code: 0, document: 0, design: 0, report: 0 };

            await Promise.all(types.map(async (type) => {
                let statusFilters = ['document'];
                if (type === 'code') statusFilters = ['code'];
                else if (type === 'design') statusFilters = ['design', 'image'];
                else if (type === 'report') statusFilters = ['report'];
                else if (type === 'document') statusFilters = ['md', 'markdown', 'text_content', 'document'];

                const { count, error } = await supabase
                    .from('trinity_artifacts')
                    .select('*', { count: 'exact', head: true })
                    .in('artifact_type', statusFilters);

                if (!error) newCounts[type] = count || 0;
            }));

            setCounts(newCounts);
        } catch (e) {
            console.error('Error fetching total counts:', e);
        }
    };

    const fetchArtifacts = async (reset = false) => {
        try {
            const currentPage = reset ? 0 : page;
            const { data, error } = await supabase
                .from('trinity_artifacts')
                .select(`*`)
                .order('created_at', { ascending: false })
                .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

            if (error) throw error;

            const mappedData = (data || []).map((item: any) => {
                const rawType = item.artifact_type || item.type || 'document';
                let mappedType: Artifact['type'] = 'document';

                if (rawType === 'report') mappedType = 'report';
                else if (rawType === 'code') mappedType = 'code';
                else if (rawType === 'design' || rawType === 'image') mappedType = 'design';
                else if (rawType === 'md' || rawType === 'markdown' || rawType === 'text_content') mappedType = 'document';

                return {
                    id: item.id,
                    title: item.title || 'Untitled Artifact',
                    type: mappedType,
                    content: item.content || '',
                    createdAt: item.created_at,
                    shareCount: 0,
                    url: item.url,
                    accessLevel: item.access_level || 'protected',
                    creator_agent: item.creator_agent || item.agent,
                    verified_by: [],
                    task_status: 'completed'
                };
            });

            if (reset) {
                setArtifacts(mappedData);
                setPage(1);
            } else {
                setArtifacts((prev: Artifact[]) => [...prev, ...mappedData]);
                setPage(prev => prev + 1);
            }

            if (mappedData.length < PAGE_SIZE) {
                setHasMore(false);
            }
        } catch (error) {
            console.error('Error fetching artifacts:', error);
            toast.error('Failed to load artifacts');
        } finally {
            setLoading(false);
        }
    };

    // HANDLERS
    const handleCategoryClick = () => {
        // Gates disabled
    };

    const handleArtifactClick = (artifact: Artifact) => {
        setSelectedArtifact(artifact);
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'code': return FileCode;
            case 'document':
            case 'md':
            case 'markdown': return FileText;
            case 'design':
            case 'image': return Image;
            case 'report': return FileSpreadsheet;
            default: return FileText;
        }
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'code': return 'violet';
            case 'document':
            case 'md': return 'cyan';
            case 'design':
            case 'image': return 'pink';
            case 'report': return 'green';
            default: return 'gray';
        }
    };

    const filteredArtifacts = artifacts.filter(a => {
        const matchesSearch = a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            a.content.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = activeCategory === 'all' || a.type === activeCategory;
        return matchesSearch && matchesCategory;
    });

    if (loading && page === 0) return <div className="h-96 flex items-center justify-center"><div className="w-10 h-10 border-4 border-violet-500 rounded-full animate-spin border-t-transparent" /></div>;

    return (
        <div className="space-y-6 animate-in fade-in duration-500 relative">

            {/* Header consolidated into root NavBar */}
            {/* Filters and Categories */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={() => setActiveCategory('all')}
                        className={cn(
                            "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 border",
                            activeCategory === 'all'
                                ? "bg-violet-500/20 border-violet-500/50 text-violet-400 shadow-glow-violet"
                                : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                        )}
                    >
                        All
                    </button>
                    {[
                        { id: 'report', label: 'Reports', color: 'text-green-400', icon: FileSpreadsheet },
                        { id: 'code', label: 'Code', color: 'text-violet-400', icon: FileCode },
                        { id: 'design', label: 'Design', color: 'text-pink-400', icon: Image },
                        { id: 'document', label: 'Documents', color: 'text-cyan-400', icon: FileText }
                    ].map((cat) => (
                        <button
                            key={cat.id}
                            onClick={() => setActiveCategory(cat.id)}
                            className={cn(
                                "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 border flex items-center gap-2",
                                activeCategory === cat.id
                                    ? "bg-white/10 border-white/20 shadow-lg"
                                    : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                            )}
                        >
                            <cat.icon className={cn("w-4 h-4", activeCategory === cat.id ? cat.color : "text-gray-500")} />
                            <span className={activeCategory === cat.id ? "text-white" : ""}>{cat.label}</span>
                            <span className="text-[10px] opacity-50 bg-white/5 px-1.5 rounded">{counts[cat.id] || 0}</span>
                        </button>
                    ))}
                </div>

                <div className="w-full md:w-64">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search artifacts..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-4 text-sm text-white focus:outline-none focus:border-violet-500 transition-all pl-10"
                        />
                        <FileText className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                    </div>
                </div>
            </div>

            {/* Artifact Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 transition-all duration-500">
                {filteredArtifacts.length === 0 ? (
                    <div className="col-span-full flex flex-col items-center justify-center py-16 text-gray-500 glass rounded-xl border border-white/5">
                        <FileText className="w-12 h-12 mb-4 opacity-50" />
                        <p>{searchQuery ? `No artifacts found for "${searchQuery}"` : 'No artifacts generated yet'}</p>
                    </div>
                ) : (
                    filteredArtifacts.map((artifact) => {
                        const Icon = getTypeIcon(artifact.type);
                        const color = getTypeColor(artifact.type);
                        const colorHex = color === 'violet' ? '#a78bfa' : color === 'cyan' ? '#22d3ee' : color === 'pink' ? '#f472b6' : '#4ade80';

                        return (
                            <div
                                key={artifact.id}
                                onClick={() => handleArtifactClick(artifact)}
                                className="glass rounded-xl p-5 border border-white/10 hover:border-violet-500/50 transition-all duration-300 group hover:-translate-y-1 hover:shadow-2xl cursor-pointer"
                            >
                                <div className="flex items-start gap-4 mb-4">
                                    <div className="p-3 glass-light rounded-lg border border-white/5 flex items-center justify-center">
                                        <Icon className="w-6 h-6" style={{ color: colorHex }} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-semibold mb-1 truncate text-gray-100">{artifact.title}</h3>
                                        <span className="text-xs text-gray-500 capitalize">{artifact.type}</span>
                                    </div>
                                </div>
                                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <div className="w-4 h-4 rounded-full bg-violet-500 flex items-center justify-center text-[8px] font-bold text-white">
                                            {(artifact.creator_agent || 'A')[0].toUpperCase()}
                                        </div>
                                        <span className="text-[10px] text-zinc-500 font-mono truncate uppercase">
                                            {artifact.creator_agent?.replace('trinity-', '') || 'AGENT'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1 opacity-50">
                                        <Clock className="w-3 h-3 text-zinc-600" />
                                        <span className="text-[8px] text-zinc-600 font-bold uppercase tracking-tighter">Completed</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Pagination */}
            {hasMore && !searchQuery && (
                <div className="flex justify-center py-8">
                    <button
                        onClick={() => fetchArtifacts(false)}
                        disabled={loading}
                        className="glass-light hover:bg-white/10 text-gray-400 px-8 py-3 rounded-full border border-white/10 transition-all flex items-center gap-2 group"
                    >
                        {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4 group-hover:text-blue-400" />}
                        {loading ? 'Sourcing...' : 'Load More Artifacts'}
                    </button>
                </div>
            )}

            {/* Artifact Viewer Modal */}
            {selectedArtifact && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setSelectedArtifact(null)} />
                    <div className="relative glass rounded-2xl p-6 w-full max-w-4xl border border-white/20 glow-violet max-h-[90vh] overflow-y-auto flex flex-col">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-2xl font-bold text-white">{selectedArtifact.title}</h3>
                            <button onClick={() => setSelectedArtifact(null)} className="text-gray-400 hover:text-white p-2">✕</button>
                        </div>
                        <div className="bg-[#0B0B0F] p-6 rounded-lg font-mono text-sm text-gray-300 whitespace-pre-wrap overflow-auto flex-1 border border-white/5">
                            <ArtifactContent content={selectedArtifact.content} type={selectedArtifact.type} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
