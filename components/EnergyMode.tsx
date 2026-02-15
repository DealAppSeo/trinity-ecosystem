"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Battery, BatteryLow, BatteryFull, Leaf } from 'lucide-react';

export type EnergyMode = 'full' | 'balanced' | 'saver';

export const EnergyModeToggle = () => {
    const [mode, setMode] = useState<EnergyMode>('balanced');
    const [showBonus, setShowBonus] = useState(false);

    useEffect(() => {
        const savedMode = localStorage.getItem('trinity-energy-mode') as EnergyMode;
        if (savedMode) setMode(savedMode);
    }, []);

    const handleModeChange = (newMode: EnergyMode) => {
        setMode(newMode);
        localStorage.setItem('trinity-energy-mode', newMode);
        if (newMode === 'saver') {
            setShowBonus(true);
            setTimeout(() => setShowBonus(false), 3000);
        }
    };

    return (
        <div className="flex flex-col gap-4 p-4 rounded-xl bg-black/20 backdrop-blur-md border border-white/10 w-full max-w-sm">
            <div className="flex items-center justify-between">
                <h3 className="text-white font-medium flex items-center gap-2">
                    <Battery className="w-5 h-5" />
                    Energy Mode
                </h3>
                <AnimatePresence>
                    {showBonus && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="flex items-center gap-1 text-green-400 text-sm font-bold"
                        >
                            <Leaf className="w-4 h-4" />
                            +5 Eco Bonus
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="grid grid-cols-3 gap-2">
                {(['full', 'balanced', 'saver'] as EnergyMode[]).map((m) => (
                    <button
                        key={m}
                        onClick={() => handleModeChange(m)}
                        className={`
                            relative py-2 px-3 rounded-lg text-xs font-semibold capitalize transition-all
                            ${mode === m
                                ? 'bg-primary text-primary-foreground shadow-lg scale-105'
                                : 'bg-white/5 text-white/60 hover:bg-white/10'}
                        `}
                    >
                        {m}
                    </button>
                ))}
            </div>

            <div className="text-[10px] text-white/40 italic">
                {mode === 'saver' && "Low power mode active. Visual effects reduced."}
                {mode === 'balanced' && "Optimized for performance and efficiency."}
                {mode === 'full' && "All visual engines active. High precision."}
            </div>
        </div>
    );
};
