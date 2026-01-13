
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

interface ShareModalProps {
    isOpen: boolean;
    onClose: () => void;
    userEmail?: string;
}

export function ShareModal({ isOpen, onClose, userEmail = 'Founder' }: ShareModalProps) {
    const [copied, setCopied] = useState(false);

    // Mock Code Generation based on user
    const uniqueCode = `TRINITY-${Math.floor(Math.random() * 10000)}`;
    const shareUrl = `https://controller.aitrinitysymphony.com/join?ref=${uniqueCode}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&format=svg&color=fff&bgcolor=000&data=${encodeURIComponent(shareUrl)}`;

    if (!isOpen) return null;

    const handleCopy = () => {
        navigator.clipboard.writeText(`Join me on the Trinity Ecosystem. Use code ${uniqueCode} for instant access: ${shareUrl}`);
        setCopied(true);
        setTimeout(() => {
            setCopied(false);
            onClose(); // Close modal after copy
        }, 1500);
    };

    return (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
            <div
                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95"
                onClick={e => e.stopPropagation()}
            >

                {/* Close Button */}
                <button onClick={onClose} className="absolute top-4 right-4 text-zinc-500 hover:text-white">
                    ✕
                </button>

                {/* Content */}
                <div className="text-center space-y-6">
                    <div className="space-y-2">
                        <h3 className="text-lg font-bold text-white">Grow the Swarm</h3>
                        <p className="text-sm text-zinc-400">
                            Invite a fellow founder. You <span className="text-purple-400">BOTH</span> unlock a free Personal Agent.
                        </p>
                    </div>

                    {/* QR Code */}
                    <div className="flex justify-center p-4 bg-white rounded-lg mx-auto w-fit">
                        <img src={qrUrl} alt="QR Code" width={160} height={160} />
                    </div>

                    {/* Code Display */}
                    <div className="bg-zinc-950 p-3 rounded-md border border-zinc-800">
                        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Your Access Code</p>
                        <p className="text-xl font-mono text-white tracking-widest">{uniqueCode}</p>
                    </div>

                    {/* Actions */}
                    <Button onClick={handleCopy} className="w-full bg-white text-black hover:bg-zinc-200">
                        {copied ? 'Copied to Clipboard!' : 'Copy Invite Link'}
                    </Button>
                </div>

            </div>
        </div>
    );
}
