
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

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const url = window.location.href;
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
            alert('Link copied to clipboard!'); // Using alert for now as sonner might not be configured efficiently globally yet
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-obsidian-surface border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/5">
                    <div>
                        <h2 className="text-xl font-bold text-white">Share Trinity Controller</h2>
                        <p className="text-xs text-zinc-400 mt-1">Share your autonomous AI swarm with the world</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors text-zinc-400 hover:text-white"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 flex flex-col items-center gap-6">
                    {/* QR Code */}
                    <div className="bg-white p-4 rounded-xl shadow-inner">
                        {qrUrl ? (
                            <img src={qrUrl} alt="QR Code" className="w-48 h-48" />
                        ) : (
                            <div className="w-48 h-48 bg-zinc-200 animate-pulse rounded" />
                        )}
                    </div>

                    {/* Link Copy */}
                    <div className="w-full space-y-2">
                        <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Share Link</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={shareUrl}
                                readOnly
                                className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-accent-violet transition-colors"
                            />
                            <Button onClick={handleCopy} variant="primary" className="bg-[#4D4D99] hover:bg-[#5D5DA9]">
                                <Copy className="w-4 h-4 mr-2" /> Copy
                            </Button>
                        </div>
                    </div>

                    {/* Social Buttons */}
                    <div className="w-full space-y-2">
                        <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Share on Social</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => handleSocialShare('twitter')}
                                className="flex items-center justify-center gap-2 py-2.5 bg-[#1DA1F2]/10 hover:bg-[#1DA1F2]/20 text-[#1DA1F2] border border-[#1DA1F2]/20 rounded-lg transition-all font-medium text-sm"
                            >
                                <Twitter className="w-4 h-4" /> Twitter
                            </button>
                            <button
                                onClick={() => handleSocialShare('linkedin')}
                                className="flex items-center justify-center gap-2 py-2.5 bg-[#0077B5]/10 hover:bg-[#0077B5]/20 text-[#0077B5] border border-[#0077B5]/20 rounded-lg transition-all font-medium text-sm"
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
