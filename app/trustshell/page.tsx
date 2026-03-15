"use client";

import React, { useState } from 'react';
import { Shield, Zap, Lock, Globe, Server, CheckCircle2 } from 'lucide-react';

export default function TrustShellLanding() {
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [status, setStatus] = useState<'idle'|'loading'|'success'|'error'>('idle');

    async function handleJoinWaitlist(e: React.FormEvent) {
        e.preventDefault();
        setStatus('loading');
        try {
            const res = await fetch('/api/waitlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, name })
            });
            if (res.ok) {
                setStatus('success');
            } else {
                setStatus('error');
            }
        } catch {
            setStatus('error');
        }
    }

    return (
        <div className="min-h-screen bg-slate-950 text-white font-sans selection:bg-cyan-500/30">
            {/* Nav */}
            <nav className="border-b border-white/5 bg-slate-950/50 backdrop-blur-md fixed top-0 w-full z-50">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        <Shield className="w-6 h-6 text-cyan-400" />
                        <span className="font-bold text-xl tracking-wide">TrustShell</span>
                    </div>
                    <div className="space-x-6 text-sm font-medium text-slate-300 hidden md:block">
                        <a href="#features" className="hover:text-white transition">Features</a>
                        <a href="#integrations" className="hover:text-white transition">Integrations</a>
                        <a href="#pricing" className="hover:text-white transition">Pricing</a>
                    </div>
                </div>
            </nav>

            {/* Hero */}
            <section className="pt-40 pb-20 px-6 max-w-7xl mx-auto text-center">
                <div className="inline-flex items-center space-x-2 px-3 py-1 bg-cyan-500/10 text-cyan-400 rounded-full text-sm font-medium mb-8 border border-cyan-500/20">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                    <span>ERC-8004 Identity Standard</span>
                </div>
                <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 bg-gradient-to-br from-white to-slate-500 bg-clip-text text-transparent">
                    The Decentralized <br/>Trust Layer for AI Agents
                </h1>
                <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
                    Stop Hallucinated outputs at the protocol level. We provide BFT Consensus checks, x402 payment rails, and Identity verification via NIST-compliant ZKPs.
                </p>
                
                <div className="max-w-md mx-auto bg-slate-900 border border-white/10 p-2 rounded-xl shadow-2xl">
                    {status === 'success' ? (
                        <div className="p-4 text-center text-emerald-400 flex flex-col items-center">
                            <CheckCircle2 className="w-8 h-8 mb-2" />
                            <span className="font-semibold">Welcome to the Alpha. Check your email.</span>
                        </div>
                    ) : (
                        <form onSubmit={handleJoinWaitlist} className="flex flex-col space-y-3">
                            <input 
                                type="text" 
                                placeholder="Name (Optional)" 
                                value={name} 
                                onChange={e => setName(e.target.value)}
                                className="w-full bg-slate-950 text-white px-4 py-3 rounded-lg border border-slate-800 focus:outline-none focus:border-cyan-500 transition"
                            />
                            <div className="flex space-x-2">
                                <input 
                                    type="email" 
                                    required
                                    placeholder="name@company.com" 
                                    value={email} 
                                    onChange={e => setEmail(e.target.value)}
                                    className="flex-1 bg-slate-950 text-white px-4 py-3 rounded-lg border border-slate-800 focus:outline-none focus:border-cyan-500 transition"
                                />
                                <button 
                                    type="submit" 
                                    disabled={status === 'loading'}
                                    className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-lg transition disabled:opacity-50"
                                >
                                    {status === 'loading' ? 'Joining...' : 'Get Access'}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </section>

            {/* Features */}
            <section id="features" className="py-24 bg-slate-900/50 border-t border-b border-white/5 px-6">
                <div className="max-w-7xl mx-auto">
                    <h2 className="text-3xl font-bold text-center mb-16">Infrastructure grade agent liability.</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <FeatureCard 
                            icon={<Lock className="text-emerald-400 w-8 h-8" />}
                            title="NIST SP 800-53 Compliant ZKPs"
                            desc="We automatically scale proofs from ultra-fast Plonky3 SNARKs to fully transparent Miden STARKs based on calculated network risk."
                        />
                        <FeatureCard 
                            icon={<Server className="text-blue-400 w-8 h-8" />}
                            title="Stochastic Bias Fracture Array"
                            desc="Generative agents are never verified by models of the same epistemic family. We catch hallucination drift by forcing architectural diversity."
                        />
                        <FeatureCard 
                            icon={<Zap className="text-amber-400 w-8 h-8" />}
                            title="Semantic PGVector Caching"
                            desc="Intelligent edge caching via vector cosine similarity. Reduce expensive API overhead across identical semantic queries by up to 40%."
                        />
                    </div>
                </div>
            </section>

            {/* Pricing */}
            <section id="pricing" className="py-24 max-w-4xl mx-auto px-6">
                <h2 className="text-3xl font-bold text-center mb-16">Transparent Security.</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-slate-900 border border-white/10 p-8 rounded-2xl flex flex-col">
                        <div className="text-xl font-bold mb-2">Hacker Tier</div>
                        <div className="text-sm text-slate-400 mb-6">For experimental agent swarms.</div>
                        <div className="text-4xl font-extrabold mb-8">$0<span className="text-lg text-slate-500 font-normal">/mo</span></div>
                        <ul className="space-y-4 mb-8 flex-1 text-slate-300">
                            <li className="flex items-center"><CheckCircle2 className="w-5 h-5 mr-3 text-cyan-500" />Up to 10k managed validations</li>
                            <li className="flex items-center"><CheckCircle2 className="w-5 h-5 mr-3 text-cyan-500" />Basic Groq / Llama Edge routing</li>
                            <li className="flex items-center"><CheckCircle2 className="w-5 h-5 mr-3 text-cyan-500" />Community Discord support</li>
                        </ul>
                    </div>
                    <div className="bg-cyan-900/20 border border-cyan-500/50 p-8 rounded-2xl flex flex-col relative overflow-hidden">
                        <div className="absolute top-0 right-0 bg-cyan-500 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">Enterprise</div>
                        <div className="text-xl font-bold mb-2 text-cyan-100">Genesis Tier</div>
                        <div className="text-sm text-cyan-300/60 mb-6">Full autonomous financial accountability.</div>
                        <div className="text-4xl font-extrabold text-white mb-8">$499<span className="text-lg text-cyan-400/50 font-normal">/mo</span></div>
                        <ul className="space-y-4 mb-8 flex-1 text-cyan-100">
                            <li className="flex items-center"><CheckCircle2 className="w-5 h-5 mr-3 text-cyan-400" />Unlimited x402 payment bridges</li>
                            <li className="flex items-center"><CheckCircle2 className="w-5 h-5 mr-3 text-cyan-400" />Hybrid SNARK/STARK Provenance logs</li>
                            <li className="flex items-center"><CheckCircle2 className="w-5 h-5 mr-3 text-cyan-400" />Dedicated ANFIS routing configuration</li>
                        </ul>
                    </div>
                </div>
            </section>
        </div>
    );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
    return (
        <div className="bg-slate-950 p-6 rounded-xl border border-white/5 hover:border-white/10 transition">
            <div className="w-14 h-14 bg-slate-900 rounded-lg flex items-center justify-center mb-6">
                {icon}
            </div>
            <h3 className="text-xl font-bold mb-3">{title}</h3>
            <p className="text-slate-400 leading-relaxed text-sm">{desc}</p>
        </div>
    )
}
