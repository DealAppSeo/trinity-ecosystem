'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { Toaster, toast } from 'sonner';
import { FileCode, FileText, Image, FileSpreadsheet, Share2, Download, Eye, Lock, ShieldAlert, RefreshCw, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTrinityController } from '@/hooks/useTrinityController';
import { RegistrationModal, UnlockModal } from '@/components/AccessModals';
import { cn } from '@/lib/utils';
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
    const [counts, setCounts] = useState<Record<string, number>>({ code: 0, document: 0, design: 0, report: 0, archived: 0 });
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

    useEffect(() => {
        fetchArtifacts(true);
        fetchTotalCounts();
        if (localStorage.getItem('trinity_registration')) {
            setHasRegistered(true);
        }

        // DEEP LINKING SUPPORT
        const params = new URLSearchParams(window.location.search);
        const artId = params.get('id');
        if (artId) {
            fetchSingleArtifact(artId);
        }
    }, []);

    const fetchSingleArtifact = async (id: string) => {
        const { data, error } = await supabase.from('trinity_artifacts').select('*').eq('id', id).single();
        if (!error && data) {
            handleArtifactClick({
                id: data.id,
                title: data.title || 'Untitled',
                type: data.artifact_type || 'document',
                content: data.content || '',
                createdAt: data.created_at,
                shareCount: 0,
                accessLevel: data.access_level || 'protected',
                url: data.external_url || data.file_path,
                creator_agent: data.creator_agent || data.agent
            });
        }
    };

    const fetchTotalCounts = async () => {
        try {
            const types = ['code', 'document', 'design', 'report', 'archived'];
            const newCounts: Record<string, number> = { code: 0, document: 0, design: 0, report: 0, archived: 0 };

            await Promise.all(types.map(async (type) => {
                let statusFilters = ['document'];
                if (type === 'code') statusFilters = ['code'];
                else if (type === 'design') statusFilters = ['design', 'image'];
                else if (type === 'report') statusFilters = ['report'];
                else if (type === 'document') statusFilters = ['md', 'markdown', 'text_content', 'document'];
                else if (type === 'archived') statusFilters = ['archived'];

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
        // Update URL for deep linking
        const url = new URL(window.location.href);
        url.searchParams.set('id', artifact.id);
        window.history.pushState({}, '', url.toString());
    };

    const handleCloseModal = () => {
        setSelectedArtifact(null);
        const url = new URL(window.location.href);
        url.searchParams.delete('id');
        window.history.pushState({}, '', url.toString());
    };

    const handleShare = (artifact: Artifact) => {
        const shareUrl = `${window.location.origin}/pulse/artifacts?id=${artifact.id}`;
        navigator.clipboard.writeText(shareUrl);
        toast.info('Link copied to clipboard!');
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
                            "px-8 py-4 rounded-xl text-lg font-bold transition-all duration-300 border uppercase tracking-wider",
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
                        { id: 'document', label: 'Documents', color: 'text-cyan-400', icon: FileText },
                        { id: 'archived', label: 'Archived', color: 'text-amber-400', icon: Lock }
                    ].map((cat) => (
                        <button
                            key={cat.id}
                            onClick={() => setActiveCategory(cat.id)}
                            className={cn(
                                "px-8 py-4 rounded-xl text-lg font-bold transition-all duration-300 border flex items-center gap-4 uppercase tracking-wider",
                                activeCategory === cat.id
                                    ? "bg-white/10 border-white/20 shadow-lg text-white"
                                    : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                            )}
                        >
                            <cat.icon className={cn("w-6 h-6", activeCategory === cat.id ? cat.color : "text-gray-500")} />
                            <span>{cat.label}</span>
                            <span className="text-sm opacity-60 bg-white/5 px-3 py-1 rounded-full">{counts[cat.id] || 0}</span>
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
                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-6 text-base text-white focus:outline-none focus:border-violet-500 transition-all pl-12"
                        />
                        <FileText className="absolute left-4 top-3.5 w-5 h-5 text-gray-500" />
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
                                <div className="mt-4 pt-3 border-t border-white/5 flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <div className="w-4 h-4 rounded-full bg-violet-500 flex items-center justify-center text-[8px] font-bold text-white">
                                                {(artifact.creator_agent || 'A')[0].toUpperCase()}
                                            </div>
                                            <span className="text-[10px] text-zinc-400 font-mono truncate uppercase">
                                                BY: {artifact.creator_agent?.replace('trinity-', '') || 'AGENT'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1 opacity-50">
                                            <Clock className="w-3 h-3 text-zinc-600" />
                                            <span className="text-[8px] text-zinc-600 font-bold uppercase tracking-tighter">Completed</span>
                                        </div>
                                    </div>
                                    {artifact.verified_by && artifact.verified_by.length > 0 && (
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <ShieldAlert className="w-3 h-3 text-green-500/50" />
                                            <span className="text-[8px] text-zinc-500 font-mono truncate uppercase">
                                                VERIFIED BY: {artifact.verified_by.join(', ').replace(/trinity-/g, '')}
                                            </span>
                                        </div>
                                    )}
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
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={handleCloseModal} />
                    <div className="relative glass rounded-2xl p-6 w-full max-w-4xl border border-white/20 glow-violet max-h-[90vh] overflow-y-auto flex flex-col scale-in-center">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="text-2xl font-bold text-white mb-1">{selectedArtifact.title}</h3>
                                <div className="flex items-center gap-4 text-xs text-gray-400">
                                    <span className="flex items-center gap-1 uppercase font-mono tracking-widest text-violet-400">
                                        {selectedArtifact.creator_agent?.replace('trinity-', '')}
                                    </span>
                                    <span>•</span>
                                    <span>{new Date(selectedArtifact.createdAt).toLocaleString()}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleShare(selectedArtifact)}
                                    className="p-2.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg border border-white/10 transition-all flex items-center gap-2 text-sm font-bold"
                                    title="Copy Deep Link"
                                >
                                    <Share2 className="w-5 h-5" />
                                    <span>Share</span>
                                </button>
                                {selectedArtifact.url && (
                                    <a
                                        href={selectedArtifact.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-2.5 bg-violet-600/20 hover:bg-violet-600/40 text-violet-400 rounded-lg border border-violet-500/30 transition-all flex items-center gap-2 text-sm font-bold"
                                        title="View Source File"
                                    >
                                        <Eye className="w-5 h-5" />
                                        <span>Source</span>
                                    </a>
                                )}
                                <button onClick={handleCloseModal} className="text-gray-400 hover:text-white p-2 text-xl ml-2">✕</button>
                            </div>
                        </div>
                        <div className="bg-[#0B0B0F] p-6 rounded-lg font-mono text-sm text-gray-300 whitespace-pre-wrap overflow-auto flex-1 border border-white/5 shadow-inner">
                            <ArtifactContent content={selectedArtifact.content} type={selectedArtifact.type} />
                        </div>
                    </div>
                </div>
            )}
            {/* Storage Info Footnote */}
            <div className="mt-12 text-center text-[10px] text-gray-600 font-mono uppercase tracking-widest opacity-40">
                Artifacts are stored in Supabase Trinity Registry & Mirrored to /artifacts/ for persistence
            </div>
        </div>
    );
}
