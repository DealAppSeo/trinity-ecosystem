
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

    return (
        <div
            className="fixed inset-0 z-[10000] flex items-start justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-300 p-4 pt-[8vh] sm:pt-[15vh] overflow-y-auto scrollbar-hide"
            onClick={onClose}
        >
            <div
                className="w-full max-w-sm bg-zinc-950 border border-white/10 rounded-[2rem] shadow-[0_0_50px_-12px_rgba(139,92,246,0.3)] overflow-hidden animate-in zoom-in-95 duration-300 relative mb-8"
                onClick={e => e.stopPropagation()}
            >
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 p-2 hover:bg-white/10 rounded-full transition-all text-zinc-500 hover:text-white z-10 hover:scale-110 active:scale-90"
                >
                    <X className="w-6 h-6" />
                </button>

                {/* Body */}
                <div className="p-8 flex flex-col items-center gap-8 text-center">
                    <div className="space-y-3">
                        <h2 className="text-2xl font-bold text-white tracking-tight">Grow the Swarm</h2>
                        <p className="text-sm text-zinc-400 leading-relaxed px-4">
                            Invite a fellow founder. You <span className="text-violet-400 font-bold uppercase tracking-wider">BOTH</span> unlock a free Personal Agent.
                        </p>
                    </div>

                    {/* QR Code Section */}
                    <div className="relative group">
                        <div className="absolute -inset-4 bg-gradient-to-tr from-violet-500/20 to-cyan-500/20 rounded-[2.5rem] blur-2xl opacity-50 group-hover:opacity-100 transition-opacity duration-500" />
                        <div className="relative bg-white p-5 rounded-[2rem] shadow-2xl ring-1 ring-white/20 transform transition-transform duration-500 group-hover:scale-105">
                            {qrUrl ? (
                                <img src={qrUrl} alt="QR Code" className="w-32 h-32 sm:w-40 sm:h-40" />
                            ) : (
                                <div className="w-32 h-32 sm:w-40 sm:h-40 bg-zinc-100 animate-pulse rounded-xl" />
                            )}
                        </div>
                    </div>

                    {/* Access Code */}
                    <div className="w-full bg-white/5 p-5 rounded-2xl border border-white/10 backdrop-blur-sm">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-[0.3em] mb-2 font-black">Authorized Access Code</p>
                        <p className="text-2xl font-mono text-white tracking-[0.15em] font-bold">{uniqueCode}</p>
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
