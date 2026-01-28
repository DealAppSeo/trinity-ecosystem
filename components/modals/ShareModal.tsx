
'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { X, Copy, Twitter, Linkedin, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from 'sonner';

interface ShareModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function ShareModal({ isOpen, onClose }: ShareModalProps) {
    const [qrUrl, setQrUrl] = useState<string>('');
    const [shareUrl, setShareUrl] = useState<string>('');
    const [copied, setCopied] = useState(false);

    // Mock Code for UI flavor
    const uniqueCode = `TRINITY-${Math.floor(Math.random() * 10000)}`;

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const url = window.location.origin + '/join?ref=' + uniqueCode;
            setShareUrl(url);
            generateQR(url);
        }
    }, [isOpen]);

    const generateQR = async (text: string) => {
        try {
            const url = await QRCode.toDataURL(text, {
                width: 300,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });
            setQrUrl(url);
        } catch (err) {
            console.error(err);
        }
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            toast.success('Link copied to clipboard!');
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy', err);
        }
    };

    const handleSocialShare = (platform: 'twitter' | 'linkedin') => {
        const text = encodeURIComponent("Check out this Autonomous AI Swarm running on Trinity OS! 🤖✨");
        const url = encodeURIComponent(shareUrl);

        let link = '';
        if (platform === 'twitter') {
            link = `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
        } else if (platform === 'linkedin') {
            link = `https://www.linkedin.com/sharing/share-offsite/?url=${url}`;
        }

        window.open(link, '_blank', 'width=600,height=400');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 p-4" onClick={onClose}>
            <div
                className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 relative"
                onClick={e => e.stopPropagation()}
            >
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full transition-colors text-zinc-500 hover:text-white z-10"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Body */}
                <div className="p-8 flex flex-col items-center gap-6 text-center">
                    <div className="space-y-2">
                        <h2 className="text-xl font-bold text-white tracking-tight">Grow the Swarm</h2>
                        <p className="text-sm text-zinc-400">
                            Invite a fellow founder. You <span className="text-accent-violet font-semibold">BOTH</span> unlock a free Personal Agent.
                        </p>
                    </div>

                    {/* QR Code */}
                    <div className="bg-white p-4 rounded-xl shadow-inner ring-1 ring-white/10">
                        {qrUrl ? (
                            <img src={qrUrl} alt="QR Code" className="w-40 h-40" />
                        ) : (
                            <div className="w-40 h-40 bg-zinc-200 animate-pulse rounded" />
                        )}
                    </div>

                    {/* Status / Code */}
                    <div className="w-full bg-zinc-950 p-4 rounded-xl border border-zinc-800/50">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] mb-1 font-bold">Your Access Code</p>
                        <p className="text-2xl font-mono text-white tracking-[0.1em]">{uniqueCode}</p>
                    </div>

                    {/* Actions */}
                    <div className="w-full space-y-3">
                        <Button
                            onClick={handleCopy}
                            className="w-full py-6 text-base bg-white text-black hover:bg-zinc-200 font-bold shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                            {copied ? 'Copied!' : 'Copy Invite Link'}
                        </Button>

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => handleSocialShare('twitter')}
                                className="flex items-center justify-center gap-2 py-3 bg-[#1DA1F2]/10 hover:bg-[#1DA1F2]/20 text-[#1DA1F2] border border-[#1DA1F2]/20 rounded-lg transition-all font-medium text-xs"
                            >
                                <Twitter className="w-4 h-4" /> Twitter
                            </button>
                            <button
                                onClick={() => handleSocialShare('linkedin')}
                                className="flex items-center justify-center gap-2 py-3 bg-[#0077B5]/10 hover:bg-[#0077B5]/20 text-[#0077B5] border border-[#0077B5]/20 rounded-lg transition-all font-medium text-xs"
                            >
                                <Linkedin className="w-4 h-4" /> LinkedIn
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
