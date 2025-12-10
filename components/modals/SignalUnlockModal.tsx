'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';

interface SignalUnlockModalProps {
    isOpen: boolean;
    onClose: () => void;
    onUnlock: () => void;
}

export function SignalUnlockModal({ isOpen, onClose, onUnlock }: SignalUnlockModalProps) {
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleUnlock = async (provider: 'linkedin' | 'email') => {
        setLoading(true);
        // Simulate auth delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        // In a real app, this would trigger OAuth or Magic Link
        // For this build, we record the "event" and grant access
        await supabase.from('signal_events').insert([{
            event_type: 'signal_unlocked',
            metadata: { provider }
        }]);

        setLoading(false);
        onUnlock();
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-obsidian-elevated border border-accent-violet/30 rounded-xl p-8 max-w-sm w-full text-center shadow-glow-violet" onClick={e => e.stopPropagation()}>
                <div className="text-4xl mb-4">🔓</div>
                <h3 className="text-2xl font-bold text-text-primary mb-2">Unlock Trinity Signal</h3>
                <p className="text-text-secondary mb-8 text-sm leading-relaxed">
                    Gain access to real-time market sentiment and ecosystem trends analyzed by our agent swarm.
                </p>

                <div className="space-y-3">
                    <Button
                        className="w-full bg-[#0077b5] hover:bg-[#006396] text-white py-4"
                        onClick={() => handleUnlock('linkedin')}
                        disabled={loading}
                    >
                        {loading ? 'Verifying...' : 'Unlock with LinkedIn'}
                    </Button>

                    <Button
                        variant="secondary"
                        className="w-full py-4 text-sm"
                        onClick={() => handleUnlock('email')}
                        disabled={loading}
                    >
                        Use Professional Email
                    </Button>
                </div>

                <p className="mt-6 text-xs text-text-muted">
                    Smart money investors only. Verification required.
                </p>
            </div>
        </div>
    );
}
