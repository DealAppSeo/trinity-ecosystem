'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
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
                                className="glass rounded-2xl p-6 border border-white/10 hover:border-violet-500/50 transition-all duration-500 group hover:-translate-y-1 hover:shadow-[0_0_40px_-10px_rgba(139,92,246,0.2)] cursor-pointer relative overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                                <div className="flex items-start gap-4 mb-5 relative z-10">
                                    <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 group-hover:border-violet-500/30 transition-colors flex items-center justify-center">
                                        <Icon className="w-6 h-6" style={{ color: colorHex }} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-bold text-gray-100 group-hover:text-white transition-colors truncate mb-1">{artifact.title}</h3>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">{artifact.type}</span>
                                            <span className="w-1 h-1 rounded-full bg-zinc-700" />
                                            <span className="text-[10px] text-zinc-500 font-mono italic">SYMPHONY_GEN_4</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4 relative z-10">
                                    <div className="p-3 rounded-xl bg-black/20 border border-white/5 text-[10px] text-zinc-400 font-mono line-clamp-2 italic">
                                        {artifact.content.slice(0, 150)}...
                                    </div>

                                    <div className="pt-4 border-t border-white/5 flex flex-col gap-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white shadow-lg">
                                                    {(artifact.creator_agent || 'A')[0].toUpperCase()}
                                                </div>
                                                <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                                                    BY: {artifact.creator_agent?.replace('trinity-', '') || 'AGENT'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-green-500/5 border border-green-500/10">
                                                <div className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
                                                <span className="text-[8px] text-green-500/70 font-black uppercase tracking-tighter">SECURED</span>
                                            </div>
                                        </div>

                                        {artifact.verified_by && artifact.verified_by.length > 0 ? (
                                            <div className="flex items-center gap-2">
                                                <ShieldAlert className="w-3.5 h-3.5 text-cyan-400/70" />
                                                <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider truncate">
                                                    VERIFIED: {artifact.verified_by.join(', ').replace(/trinity-/g, '')}
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 opacity-30">
                                                <ShieldAlert className="w-3.5 h-3.5 text-zinc-600" />
                                                <span className="text-[9px] text-zinc-600 font-bold uppercase tracking-wider">AWAITING PEER REVIEW</span>
                                            </div>
                                        )}
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
                <div className="fixed inset-0 z-[180] flex items-center justify-center p-4 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-black/95 backdrop-blur-2xl" onClick={handleCloseModal} />

                    <div className="relative glass rounded-[2.5rem] w-full max-w-5xl border border-white/10 shadow-[0_0_100px_-20px_rgba(139,92,246,0.4)] overflow-hidden flex flex-col max-h-[92vh]">
                        {/* High-Fidelity Header */}
                        <div className="p-8 border-b border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent shrink-0">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                                <div className="flex items-center gap-6">
                                    <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/10 flex items-center justify-center shadow-inner">
                                        {React.createElement(getTypeIcon(selectedArtifact.type), {
                                            className: "w-8 h-8",
                                            style: { color: getTypeColor(selectedArtifact.type) === 'violet' ? '#a78bfa' : getTypeColor(selectedArtifact.type) === 'cyan' ? '#22d3ee' : '#f472b6' }
                                        })}
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-violet-400 font-black uppercase tracking-[0.3em] block mb-1">Knowledge Artifact / v1.0</span>
                                        <h3 className="text-3xl font-black text-white tracking-tight">{selectedArtifact.title}</h3>
                                        <div className="flex items-center gap-3 mt-2">
                                            <div className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[9px] font-mono text-zinc-500 uppercase tracking-widest">UID: {String(selectedArtifact.id).slice(0, 12)}</div>
                                            <div className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[9px] font-mono text-zinc-500 tracking-widest">{new Date(selectedArtifact.createdAt).toLocaleString()}</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => handleShare(selectedArtifact)}
                                        className="h-12 px-6 bg-white/5 hover:bg-white/10 text-white rounded-2xl border border-white/10 transition-all flex items-center gap-3 font-bold text-sm"
                                    >
                                        <Share2 className="w-4 h-4" /> Share
                                    </button>
                                    {selectedArtifact.url && (
                                        <a
                                            href={selectedArtifact.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="h-12 px-6 bg-violet-600 hover:bg-violet-500 text-white rounded-2xl transition-all flex items-center gap-3 font-bold text-sm shadow-lg shadow-violet-500/20"
                                        >
                                            <Eye className="w-4 h-4" /> Source View
                                        </a>
                                    )}
                                    <button
                                        onClick={handleCloseModal}
                                        className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-500 transition-all border border-white/10 ml-2"
                                    >
                                        <X className="w-6 h-6" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                            {/* Main Display */}
                            <div className="flex-1 p-8 overflow-y-auto custom-scrollbar bg-black/40">
                                <div className="prose prose-invert max-w-none">
                                    <ArtifactContent content={selectedArtifact.content} type={selectedArtifact.type} />
                                </div>
                            </div>

                            {/* Sidebar Meta */}
                            <div className="w-full md:w-80 border-l border-white/10 p-8 space-y-8 bg-white/[0.01] overflow-y-auto shrink-0">
                                <div>
                                    <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                        <Award className="w-3 h-3" /> Originating Identity
                                    </h4>
                                    <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-xl font-bold text-white shadow-xl">
                                            {(selectedArtifact.creator_agent || 'A')[0].toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="font-bold text-white uppercase tracking-tight">{selectedArtifact.creator_agent?.replace('trinity-', '') || 'AGENT_X'}</p>
                                            <p className="text-[10px] text-violet-400 font-mono">MISSION_OWNER_ID</p>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                        <ShieldAlert className="w-3 h-3" /> Integrity Verification
                                    </h4>
                                    <div className="space-y-3">
                                        {selectedArtifact.verified_by && selectedArtifact.verified_by.length > 0 ? (
                                            selectedArtifact.verified_by.map((v, i) => (
                                                <div key={i} className="p-4 rounded-2xl bg-green-500/5 border border-green-500/10 flex items-center gap-4 transition-all hover:bg-green-500/10">
                                                    <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center text-sm font-bold text-green-400">
                                                        {v.replace('trinity-', '')[0].toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold text-green-400 uppercase tracking-wider">{v.replace('trinity-', '')}</p>
                                                        <p className="text-[9px] text-green-500/50 font-mono">VERIFIED_MISSION_CAP</p>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 text-center flex flex-col items-center gap-2">
                                                <RefreshCw className="w-5 h-5 text-zinc-600 animate-spin-slow" />
                                                <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest leading-relaxed">Cross-Agent Verification<br />in Progress</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="pt-8 border-t border-white/5 mt-auto">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Access Level</span>
                                        <span className="text-[10px] text-green-400 font-bold bg-green-400/10 px-2 py-0.5 rounded border border-green-400/20">{selectedArtifact.accessLevel.toUpperCase()}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Storage Status</span>
                                        <span className="text-[10px] text-cyan-400 font-bold">REPLICATED</span>
                                    </div>
                                </div>
                            </div>
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
