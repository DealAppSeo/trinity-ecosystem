'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { FileCode, FileText, Image, FileSpreadsheet, Share2, Download, Eye, Lock, ShieldAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTrinityController } from '@/hooks/useTrinityController';
import { RegistrationModal, UnlockModal } from '@/components/AccessModals';

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
}

export default function ArtifactsPage() {
    const [artifacts, setArtifacts] = useState<Artifact[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);

    // ACCESS GATES
    const [hasRegistered, setHasRegistered] = useState(false);
    const [hasUnlocked, setHasUnlocked] = useState(false);

    // UI STATES
    const [showRegModal, setShowRegModal] = useState(false);
    const [showUnlockModal, setShowUnlockModal] = useState(false);
    const [pendingArtifact, setPendingArtifact] = useState<Artifact | null>(null);

    // Initial Fetch (Public Data Only - Counts)
    useEffect(() => {
        fetchArtifacts();
        if (localStorage.getItem('trinity_registration')) {
            setHasRegistered(true);
        }
    }, []);

    const fetchArtifacts = async () => {
        try {
            const { data, error } = await supabase
                .from('trinity_artifacts')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            const mappedData = (data || []).map((item: any) => ({
                id: item.id,
                title: item.title || 'Untitled Artifact',
                type: (item.type || 'document') as Artifact['type'],
                content: item.content || '',
                createdAt: item.created_at,
                shareCount: 0,
                url: item.url,
                accessLevel: item.access_level || 'protected'
            }));

            setArtifacts(mappedData);
        } catch (error) {
            console.error('Error fetching artifacts:', error);
        } finally {
            setLoading(false);
        }
    };

    // HANDLERS
    const handleCategoryClick = () => {
        if (!hasRegistered) {
            setShowRegModal(true);
        }
    };

    const handleArtifactClick = (artifact: Artifact) => {
        if (!hasRegistered) {
            setShowRegModal(true);
            return;
        }
        setPendingArtifact(artifact);
        setShowUnlockModal(true);
    };

    const handleUnlockSuccess = () => {
        setShowUnlockModal(false);
        if (pendingArtifact) {
            setSelectedArtifact(pendingArtifact);
            setPendingArtifact(null);
        }
    };

    const handleRegisterSuccess = () => {
        setHasRegistered(true);
        localStorage.setItem('trinity_registration', 'true');
        setShowRegModal(false);
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

    if (loading) return <div className="h-96 flex items-center justify-center"><div className="w-10 h-10 border-4 border-violet-500 rounded-full animate-spin border-t-transparent" /></div>;

    return (
        <div className="space-y-6 animate-in fade-in duration-500 relative">
            <RegistrationModal
                isOpen={showRegModal}
                onClose={() => setShowRegModal(false)}
                onSuccess={handleRegisterSuccess}
            />

            <UnlockModal
                isOpen={showUnlockModal}
                onClose={() => setShowUnlockModal(false)}
                onSuccess={handleUnlockSuccess}
                artifactTitle={pendingArtifact?.title || 'Restricted Artifact'}
            />

            {/* Header */}
            <div className="glass rounded-xl p-6 border border-white/10">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-2xl font-bold mb-2 text-white">Artifact Library</h2>
                        <p className="text-gray-400 text-sm">
                            Digital assets generated by your autonomous swarm. {hasRegistered ? <span className="text-green-400"> • Identity Verified</span> : <span className="text-amber-400"> • Public View</span>}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
                    {['code', 'document', 'design', 'report'].map((type) => {
                        const count = artifacts.filter((a) => a.type === type || (type === 'document' && a.type === 'md')).length;
                        const Icon = getTypeIcon(type);
                        const color = getTypeColor(type);

                        return (
                            <div
                                key={type}
                                onClick={handleCategoryClick}
                                className={`glass-light rounded-lg p-4 border border-\${color}-500/30 cursor-pointer hover:bg-white/5 transition-all relative overflow-hidden group`}
                            >
                                {!hasRegistered && (
                                    <div className="absolute top-2 right-2 text-gray-500">
                                        <Lock size={14} />
                                    </div>
                                )}
                                <div className={`text-\${color}-400 mb-2`}>
                                    <Icon className="w-6 h-6" />
                                </div>
                                <div className="text-2xl font-bold mb-1 text-white">{count}</div>
                                <div className="text-xs text-gray-400 capitalize">{type}</div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Artifact Grid */}
            <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 transition-all duration-500 \${!hasRegistered ? 'blur-sm opacity-50 pointer-events-none select-none' : ''}`}>
                {artifacts.length === 0 ? (
                    <div className="col-span-full flex flex-col items-center justify-center py-16 text-gray-500 glass rounded-xl border border-white/5">
                        <FileText className="w-12 h-12 mb-4 opacity-50" />
                        <p>No artifacts generated yet</p>
                    </div>
                ) : (
                    artifacts.map((artifact) => {
                        const Icon = getTypeIcon(artifact.type);
                        const color = getTypeColor(artifact.type);
                        const colorHex = color === 'violet' ? '#a78bfa' : color === 'cyan' ? '#22d3ee' : color === 'pink' ? '#f472b6' : color === 'green' ? '#4ade80' : '#9ca3af';

                        return (
                            <div
                                key={artifact.id}
                                onClick={() => handleArtifactClick(artifact)}
                                className="glass rounded-xl p-5 border border-white/10 hover:border-violet-500/50 transition-all duration-300 group hover:-translate-y-1 hover:shadow-2xl cursor-pointer"
                            >
                                <div className="flex items-start gap-4 mb-4">
                                    <div className={`p-3 glass-light rounded-lg border border-\${color}-500/30 flex items-center justify-center`}>
                                        <Icon className="w-6 h-6" style={{ color: colorHex }} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-semibold mb-1 truncate text-gray-100">{artifact.title}</h3>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-gray-500 capitalize">{artifact.type}</span>
                                            <Lock size={10} className="text-red-400" />
                                        </div>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500">Restricted Access. Password Required.</p>
                            </div>
                        );
                    })
                )}
            </div>

            {/* CTA Overlay */}
            {!hasRegistered && artifacts.length > 0 && (
                <div className="absolute inset-0 top-[200px] flex items-center justify-center z-10 pointer-events-none">
                    <div className="bg-black/60 backdrop-blur-md p-8 rounded-2xl border border-violet-500/50 text-center pointer-events-auto shadow-2xl">
                        <ShieldAlert className="mx-auto w-12 h-12 text-violet-400 mb-4" />
                        <h3 className="text-2xl font-bold text-white mb-2">Restricted Access</h3>
                        <p className="text-gray-400 mb-6 max-w-sm">
                            Artifact details are protected. Please register to view the file list.
                        </p>
                        <button
                            onClick={() => setShowRegModal(true)}
                            className="bg-violet-600 hover:bg-violet-500 text-white font-bold py-3 px-8 rounded-full shadow-lg shadow-violet-900/50 transition-all hover:scale-105"
                        >
                            Register Access
                        </button>
                    </div>
                </div>
            )}

            {/* Artifact Viewer Modal */}
            {selectedArtifact && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setSelectedArtifact(null)} />
                    <div className="relative glass rounded-2xl p-6 w-full max-w-4xl border border-white/20 glow-violet max-h-[90vh] overflow-y-auto flex flex-col">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-2xl font-bold text-white">{selectedArtifact.title}</h3>
                            <button onClick={() => setSelectedArtifact(null)} className="text-gray-400 hover:text-white">✕</button>
                        </div>
                        <div className="bg-[#0B0B0F] p-4 rounded-lg font-mono text-xs text-gray-300 whitespace-pre-wrap overflow-auto flex-1">
                            {selectedArtifact.content}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
