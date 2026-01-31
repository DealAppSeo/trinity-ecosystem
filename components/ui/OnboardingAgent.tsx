
'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, X, Send, Bot, User, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Message {
    id: string;
    role: 'agent' | 'user';
    text: string;
}

export function OnboardingAgent({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            role: 'agent',
            text: "Welcome to AI Trinity Symphony - We are working on building a safe and ethical AI. We'd love to hear if that's something your interested in. If it is, please introduce yourself."
        }
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMsg: Message = { id: Date.now().toString(), role: 'user', text: input };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsTyping(true);

        try {
            // Call AI Endpoint for Onboarding (Mocked for now, but wired to logic)
            // In a real scenario, this calls /api/agents/onboard or similar
            setTimeout(() => {
                const agentMsg: Message = {
                    id: (Date.now() + 1).toString(),
                    role: 'agent',
                    text: `Thanks for introducing yourself! I'm the Symphony Onboarding Agent. It's great to have someone interested in ethical AI. How can I best help you explore the Trinity ecosystem today?`
                };
                setMessages(prev => [...prev, agentMsg]);
                setIsTyping(false);

                if ('vibrate' in navigator) navigator.vibrate(5);
            }, 1500);
        } catch (err) {
            toast.error('Onboarding brain is currently offline.');
            setIsTyping(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm shadow-[0_0_50px_rgba(139,92,246,0.3)] transition-all duration-300"
                    />

                    <motion.div
                        initial={{ y: '100%', opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: '100%', opacity: 0 }}
                        className="relative w-full max-w-lg bg-obsidian-surface border border-white/10 rounded-t-3xl sm:rounded-3xl flex flex-col h-[80vh] sm:h-[600px] overflow-hidden"
                    >
                        {/* Header */}
                        <div className="p-4 border-b border-white/5 flex items-center justify-between bg-accent-violet/5">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-accent-violet/20 flex items-center justify-center border border-accent-violet/30">
                                    <Bot className="w-6 h-6 text-accent-violet" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-white leading-none">Onboarding Agent</h3>
                                    <span className="text-[10px] text-accent-violet uppercase tracking-widest font-bold">Safe & Ethical AI Guardian</span>
                                </div>
                            </div>
                            <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white rounded-full hover:bg-white/5 transition-all">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Messages Area */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
                            {messages.map((msg) => (
                                <motion.div
                                    key={msg.id}
                                    initial={{ opacity: 0, x: msg.role === 'agent' ? -20 : 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className={cn(
                                        "flex gap-3 max-w-[85%]",
                                        msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
                                    )}
                                >
                                    <div className={cn(
                                        "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border",
                                        msg.role === 'agent' ? "bg-accent-violet/20 border-accent-violet/20" : "bg-cyan-500/20 border-cyan-500/20 text-cyan-400"
                                    )}>
                                        {msg.role === 'agent' ? <Bot className="w-4 h-4 text-accent-violet" /> : <User className="w-4 h-4" />}
                                    </div>
                                    <div className={cn(
                                        "p-3 rounded-2xl text-sm leading-relaxed",
                                        msg.role === 'agent'
                                            ? "bg-white/5 text-zinc-200 rounded-tl-none border border-white/5"
                                            : "bg-cyan-500 text-black font-medium rounded-tr-none"
                                    )}>
                                        {msg.text}
                                    </div>
                                </motion.div>
                            ))}
                            {isTyping && (
                                <div className="flex gap-3 max-w-[85%]">
                                    <div className="w-8 h-8 rounded-full bg-accent-violet/20 flex items-center justify-center animate-pulse">
                                        <Bot className="w-4 h-4 text-accent-violet" />
                                    </div>
                                    <div className="bg-white/5 p-3 rounded-2xl rounded-tl-none border border-white/5 flex gap-1">
                                        <span className="w-1 h-1 bg-zinc-500 rounded-full animate-bounce" />
                                        <span className="w-1 h-1 bg-zinc-500 rounded-full animate-bounce delay-100" />
                                        <span className="w-1 h-1 bg-zinc-500 rounded-full animate-bounce delay-200" />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Input Area */}
                        <div className="p-4 border-t border-white/5 bg-black/40">
                            <div className="relative flex items-center gap-2">
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                                    placeholder="Type your introduction..."
                                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-accent-violet/50 transition-all"
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={!input.trim() || isTyping}
                                    className="w-12 h-12 bg-accent-violet text-white rounded-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
                                >
                                    <Send className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
