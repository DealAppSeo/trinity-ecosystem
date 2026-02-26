'use client';

import { PriorityTuner } from '@/components/modals/PriorityTuner';
import { motion } from 'framer-motion';
import { Settings, Shield, Bell, Share2 } from 'lucide-react';

export default function SettingsPage() {
    return (
        <div className="max-w-md mx-auto space-y-8 pb-24">
            <header className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white/5">
                    <Settings className="w-6 h-6 text-primary" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-white">Settings</h1>
                    <p className="text-text-muted text-sm italic">Fine-tune your orchestrator.</p>
                </div>
            </header>

            {/* Priority Section */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 text-primary font-mono text-xs uppercase tracking-widest">
                    <Shield className="w-4 h-4" />
                    Agent Consensus Priority
                </div>
                <PriorityTuner />
            </section>

            {/* Extra Settings Stubs */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs uppercase tracking-widest">
                    <Bell className="w-4 h-4" />
                    Notification Bridge
                </div>
                <div className="bg-white/5 rounded-2xl border border-white/10 p-4 flex justify-between items-center">
                    <div>
                        <p className="text-sm font-semibold text-white">Push Notifications</p>
                        <p className="text-[10px] text-text-muted">Receive alerts for High Bias detection.</p>
                    </div>
                    <div className="w-10 h-5 bg-primary/20 rounded-full relative">
                        <div className="absolute right-1 top-1 w-3 h-3 bg-primary rounded-full" />
                    </div>
                </div>
            </section>

            <section className="space-y-4">
                <div className="flex items-center gap-2 text-amber-400 font-mono text-xs uppercase tracking-widest">
                    <Share2 className="w-4 h-4" />
                    Viral Features
                </div>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/10 opacity-60">
                    <p className="text-xs text-text-muted italic">Shareable Insights coming soon in Phase v2.1...</p>
                </div>
            </section>

            {/* Savings Footnote */}
            <footer className="text-center py-10 opacity-40">
                <p className="text-[10px] font-mono">TRINITY SYMPHONY v2.0</p>
                <p className="text-[8px] mt-1 uppercase tracking-tighter">Honorable, Antifragile, Sovereign</p>
            </footer>
        </div>
    );
}
