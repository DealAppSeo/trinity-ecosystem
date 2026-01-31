
'use client';

import { useState, useRef, useEffect } from 'react';
import QRCode from 'qrcode';
import { X, Copy, Share2, Check, Download, Referral } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ShareModalProps {
    isOpen: boolean;
    onClose: () => void;
    referralCode?: string;
}

export function ShareModal({ isOpen, onClose, referralCode }: ShareModalProps) {
    const [qrDataUrl, setQrDataUrl] = useState<string>('');
    const [copied, setCopied] = useState(false);
    const shareUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/join?ref=${referralCode || 'FOUNDER'}`
        : '';

    useEffect(() => {
        if (isOpen && shareUrl) {
            QRCode.toDataURL(shareUrl, {
                width: 300,
                margin: 2,
                color: {
                    dark: '#00D4FF',
                    light: '#00000000'
                }
            }).then(setQrDataUrl);
        }
    }, [isOpen, shareUrl]);

    const handleCopy = () => {
        navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        toast.success('Link copied to clipboard!');
        setTimeout(() => setCopied(false), 2000);

        // Haptic feedback if available
        if (typeof window !== 'undefined' && 'vibrate' in navigator) {
            navigator.vibrate(10);
        }
    };

    const handleShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Join AI Trinity Symphony',
                    text: 'Help build a safe and ethical AI future. Join the symphony today!',
                    url: shareUrl,
                });
            } catch (err) {
                console.error('Share failed:', err);
            }
        } else {
            handleCopy();
        }
    };

    const downloadQR = () => {
        const link = document.createElement('a');
        link.download = 'trinity-qr.png';
        link.href = qrDataUrl;
        link.click();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/80 backdrop-blur-xl"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        className="relative w-full max-w-sm bg-obsidian-surface border border-white/10 rounded-2xl p-6 shadow-2xl shadow-accent-cyan/10"
                    >
                        {/* Close Button */}
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-all"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="text-center mb-6">
                            <h2 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-transparent">
                                Share & Earn
                            </h2>
                            <p className="text-zinc-400 text-sm mt-1">
                                Every referral strengthens the Truth Collective.
                            </p>
                        </div>

                        {/* QR Code Container */}
                        <div className="relative aspect-square w-full bg-black/40 border border-white/5 rounded-xl flex items-center justify-center overflow-hidden mb-6 p-4 group">
                            {qrDataUrl ? (
                                <img src={qrDataUrl} alt="Referral QR Code" className="w-full h-full object-contain" />
                            ) : (
                                <div className="w-12 h-12 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                            )}

                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                <button
                                    onClick={downloadQR}
                                    className="p-3 bg-cyan-500 rounded-full text-black hover:scale-110 transition-transform"
                                    title="Download QR"
                                >
                                    <Download className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Referral Link Area */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 p-1 bg-black/40 border border-white/5 rounded-lg">
                                <div className="flex-1 px-3 py-2 text-xs font-mono text-zinc-400 truncate">
                                    {shareUrl}
                                </div>
                                <button
                                    onClick={handleCopy}
                                    className={cn(
                                        "p-2 rounded-md transition-all",
                                        copied ? "bg-green-500/20 text-green-500" : "bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10"
                                    )}
                                >
                                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                </button>
                            </div>

                            <button
                                onClick={handleShare}
                                className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-xl shadow-lg shadow-cyan-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                            >
                                <Share2 className="w-5 h-5" />
                                Share with Friends
                            </button>

                            <p className="text-[10px] text-zinc-500 text-center uppercase tracking-widest font-bold">
                                Registered users get REPID credit for every join.
                            </p>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
