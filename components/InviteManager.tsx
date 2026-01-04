'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Copy, RefreshCw, Key } from 'lucide-react';

interface Invite {
    id: string;
    code: string;
    status: 'active' | 'used' | 'revoked' | 'expired';
    expires_at: string;
    created_at: string;
}

export default function InviteManager({ supabase }: { supabase: any }) {
    const [invites, setInvites] = useState<Invite[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isCreating, setIsCreating] = useState(false);

    const fetchInvites = async () => {
        setIsLoading(true);
        const { data } = await supabase
            .from('trinity_access_invites')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);
        if (data) setInvites(data);
        setIsLoading(false);
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchInvites();
    }, []);

    const createInvite = async () => {
        setIsCreating(true);
        // Generate random code: 3 segments of 4 chars
        const segment = () => Math.random().toString(36).substring(2, 6).toUpperCase();
        const code = `TRINITY-${segment()}-${segment()}`;
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

        const { error } = await supabase
            .from('trinity_access_invites')
            .insert({
                code,
                status: 'active',
                expires_at: expiresAt,
                created_by: 'Conductor Admin'
            })
            .select()
            .single();

        if (error) {
            alert('Failed to create invite: ' + error.message);
        } else {
            await fetchInvites();
        }
        setIsCreating(false);
    };

    const revokeInvite = async (id: string) => {
        await supabase.from('trinity_access_invites').update({ status: 'revoked' }).eq('id', id);
        fetchInvites();
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    return (
        <div className="w-full bg-[#0F0F0F] rounded-xl border border-white/10 p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-[#00D4FF]/10 rounded-lg">
                        <Key className="w-5 h-5 text-[#00D4FF]" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white font-geist">Access Keys</h2>
                        <p className="text-xs text-white/40">Manage subdomain entry codes</p>
                    </div>
                </div>
                <button
                    onClick={createInvite}
                    disabled={isCreating}
                    className="flex items-center gap-2 px-3 py-1.5 bg-[#00D4FF]/10 hover:bg-[#00D4FF]/20 text-[#00D4FF] rounded-lg text-xs font-mono transition-colors"
                >
                    {isCreating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    GENERATE KEY
                </button>
            </div>

            <div className="space-y-2">
                {invites.map((invite) => (
                    <div key={invite.id} className="flex items-center justify-between bg-white/5 border border-white/5 rounded-lg p-3 group hover:border-[#00D4FF]/30 transition-colors">
                        <div className="flex items-center gap-4">
                            <div className={`w-2 h-2 rounded-full ${invite.status === 'active' ? 'bg-[#00D4FF] animate-pulse' : 'bg-red-500'}`} />
                            <code className="text-[#00D4FF] font-mono text-sm tracking-wider">{invite.code}</code>
                            <span className="text-[10px] text-white/30 uppercase border border-white/10 px-1.5 py-0.5 rounded">
                                {invite.status}
                            </span>
                        </div>

                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={() => copyToClipboard(invite.code)}
                                className="p-1.5 hover:bg-white/10 rounded text-white/50 hover:text-white"
                                title="Copy Code"
                            >
                                <Copy className="w-3 h-3" />
                            </button>
                            {invite.status === 'active' && (
                                <button
                                    onClick={() => revokeInvite(invite.id)}
                                    className="p-1.5 hover:bg-red-500/20 rounded text-red-500/70 hover:text-red-500"
                                    title="Revoke Code"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    </div>
                ))}

                {invites.length === 0 && !isLoading && (
                    <div className="text-center py-8 text-white/20 text-xs font-mono">
                        NO ACTIVE KEYS FOUND
                    </div>
                )}
            </div>
        </div>
    );
}
