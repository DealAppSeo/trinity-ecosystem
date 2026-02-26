'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, DollarSign, ShieldCheck, Info, X } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

export type PriorityMode = 'premium' | 'balanced' | 'economy';

interface PriorityTunerProps {
    isFirstRun?: boolean;
    onClose?: () => void;
}

export const PriorityTuner = ({ isFirstRun = false, onClose }: PriorityTunerProps) => {
    const [priority, setPriority] = useState<PriorityMode>('balanced');
    const [isVisible, setIsVisible] = useState(true);
    const { showToast } = useToast();

    useEffect(() => {
        const saved = localStorage.getItem('trinity_priority') as PriorityMode;
        if (saved) setPriority(saved);
    }, []);

    const handleSave = (mode: PriorityMode) => {
        setPriority(mode);
        localStorage.setItem('trinity_priority', mode);
        
        // Value Prop Affirmation
        const modeLabels = {
            economy: 'Best Cheapest (Max Savings)',
            balanced: 'Balanced (Optimized)',
            premium: 'Best Fastest (Elite Accuracy)'
        };
        
        showToast(
            `🚀 Priority: ${modeLabels[mode]}. Saving ~50% vs direct LLM!`, 
            'success', 
            4000
        );

        if (isFirstRun && onClose) {
            setTimeout(onClose, 1200);
        }
    };

    const modes = [
        { 
            id: 'economy', 
            label: 'Best Cheapest', 
            icon: <DollarSign className="w-4 h-4" />, 
            desc: 'Optimized for cost. High-accuracy baseline.',
            savings: '65% Avg Savings'
        },
        { 
            id: 'balanced', 
            label: 'Balanced', 
            icon: <Zap className="w-4 h-4" />, 
            desc: 'Optimal speed and triadic consensus.',
            savings: '50% Avg Savings'
        },
        { 
            id: 'premium', 
            label: 'Best Fastest', 
            icon: <Zap className="w-4 h-4 text-amber-400" />, 
            desc: 'Elite LLM routing for complex missions.',
            savings: '40% Avg Savings'
        }
    ];

    return (
        <AnimatePresence>
            {isVisible && (
                <div className={`${isFirstRun ? 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm' : 'w-full'}`}>
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="bg-obsidian-sub rounded-2xl border border-white/10 p-6 w-full max-w-md shadow-2xl"
                    >
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <ShieldCheck className="w-6 h-6 text-primary" />
                                    {isFirstRun ? 'Onboarding: Agent Protocol' : 'Agent Priority Settings'}
                                </h2>
                                <p className="text-text-muted text-sm mt-1">
                                    Direct the focus of your Symphony Swarm.
                                </p>
                            </div>
                            {!isFirstRun && onClose && (
                                <button onClick={onClose} className="p-1 hover:bg-white/5 rounded-full">
                                    <X className="w-5 h-5 text-text-muted" />
                                </button>
                            )}
                        </div>

                        {/* Value Prop Banner */}
                        <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 mb-6 flex gap-3">
                            <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                            <p className="text-xs text-primary/90 leading-relaxed">
                                <b>99% Hallucination Reduction</b> via triadic consensus. 
                                Even in Premium mode, you save <b>~50%</b> vs latest single LLM prices.
                            </p>
                        </div>

                        {/* Slider / Modes */}
                        <div className="space-y-3">
                            {modes.map((m) => (
                                <button
                                    key={m.id}
                                    onClick={() => handleSave(m.id as PriorityMode)}
                                    className={`
                                        w-full p-4 rounded-xl border transition-all flex items-start gap-4 text-left
                                        ${priority === m.id 
                                            ? 'bg-primary/5 border-primary shadow-[0_0_20px_rgba(var(--primary-rgb),0.1)]' 
                                            : 'bg-white/5 border-transparent hover:border-white/10'}
                                    `}
                                >
                                    <div className={`p-2 rounded-lg ${priority === m.id ? 'bg-primary text-black' : 'bg-white/5 text-text-muted'}`}>
                                        {m.icon}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between items-center">
                                            <span className={`font-semibold ${priority === m.id ? 'text-white' : 'text-text-muted'}`}>{m.label}</span>
                                            <span className="text-[10px] font-mono p-1 bg-black/30 rounded text-primary">{m.savings}</span>
                                        </div>
                                        <p className="text-xs text-text-muted mt-1">{m.desc}</p>
                                    </div>
                                </button>
                            ))}
                        </div>

                        {isFirstRun && (
                            <button
                                onClick={onClose}
                                className="w-full mt-8 py-3 bg-primary text-black font-bold rounded-xl hover:opacity-90 transition-opacity"
                            >
                                START CONDUCTING
                            </button>
                        )}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
