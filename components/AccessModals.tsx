'use client';

import { useState } from 'react';
import { Lock, UserPlus, Check, X, ShieldAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface RegistrationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export function RegistrationModal({ isOpen, onClose, onSuccess }: RegistrationModalProps) {
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [handle, setHandle] = useState(''); // LinkedIn or GitHub
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            // Validate Logic: Email + (Phone OR Handle)
            if (!email || (!phone && !handle)) {
                toast.error("Please provide Email and either Phone or a Social Handle.");
                setLoading(false);
                return;
            }

            const { error } = await supabase.from('trinity_access_requests').insert({
                email,
                phone,
                social_handle: handle,
                status: 'pending' // Auto-approve logic could go here later
            });

            if (error) throw error;

            toast.success("Registration Submitted! You now have Level 1 Access.");
            onSuccess(); // Unlocks Tier 1 (List View)
        } catch (error: any) {
            console.error(error);
            toast.error("Registration failed: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="bg-[#0B0B0F] border border-violet-500/30 rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white"><X size={20} /></button>

                <div className="mb-6 text-center">
                    <div className="mx-auto w-12 h-12 bg-violet-900/30 rounded-full flex items-center justify-center mb-3 border border-violet-500/50">
                        <UserPlus className="text-violet-400" size={24} />
                    </div>
                    <h2 className="text-xl font-bold text-white">Register for Access</h2>
                    <p className="text-gray-400 text-sm mt-2">
                        To view the artifact library files, please register your identity.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Email (Required)</label>
                        <input
                            type="email"
                            className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white focus:border-violet-500 outline-none"
                            placeholder="you@email.com"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Phone (Optional*)</label>
                            <input
                                type="tel"
                                className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white focus:border-violet-500 outline-none"
                                placeholder="+1..."
                                value={phone}
                                onChange={e => setPhone(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Social Handle (Optional*)</label>
                            <input
                                type="text"
                                className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white focus:border-violet-500 outline-none"
                                placeholder="GitHub/LinkedIn"
                                value={handle}
                                onChange={e => setHandle(e.target.value)}
                            />
                        </div>
                    </div>
                    <p className="text-[10px] text-gray-500">*One of Phone or Handle is required.</p>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 rounded-lg bg-violet-600 hover:bg-violet-500 transition-colors text-white font-bold shadow-lg shadow-violet-900/20 disabled:opacity-50"
                    >
                        {loading ? 'Registering...' : 'Register to View Files'}
                    </button>
                </form>
            </div>
        </div>
    );
}

interface UnlockModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    artifactTitle: string;
}

export function UnlockModal({ isOpen, onClose, onSuccess, artifactTitle }: UnlockModalProps) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Hardcoded Admin Password Logic for Prototype (As requested: "only I can provide them")
        // In prod, check against DB hash or Edge Function
        if (password === 'TrinityCreate777!' || password === 'admin') {
            toast.success("Access Granted.");
            onSuccess();
        } else {
            setError(true);
            toast.error("Incorrect Password.");
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in">
            <div className="bg-[#0B0B0F] border border-red-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative glow-red">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white"><X size={20} /></button>

                <div className="mb-6 text-center">
                    <div className="mx-auto w-12 h-12 bg-red-900/30 rounded-full flex items-center justify-center mb-3 border border-red-500/50">
                        <Lock className="text-red-400" size={24} />
                    </div>
                    <h2 className="text-xl font-bold text-white">Protected Content</h2>
                    <p className="text-gray-400 text-xs mt-2 truncate px-4">
                        {artifactTitle}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Admin Password</label>
                        <input
                            type="password"
                            className={`w-full bg-white/5 border ${error ? 'border-red-500' : 'border-white/10'} rounded-lg p-2 text-white focus:border-red-500 outline-none`}
                            placeholder="••••••••"
                            value={password}
                            onChange={e => { setPassword(e.target.value); setError(false); }}
                            autoFocus
                        />
                    </div>

                    <button
                        type="submit"
                        className="w-full py-3 rounded-lg bg-red-600 hover:bg-red-500 transition-colors text-white font-bold shadow-lg shadow-red-900/20"
                    >
                        Unlock Content
                    </button>

                    <p className="text-[10px] text-center text-gray-600">
                        Contact Administrator for access credentials.
                    </p>
                </form>
            </div>
        </div>
    );
}
