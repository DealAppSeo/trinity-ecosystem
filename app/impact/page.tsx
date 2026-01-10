'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, CheckCircle2, Sparkles, Heart, ShieldCheck, Zap } from 'lucide-react';
import Link from 'next/link';

export default function ImpactPage() {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('loading');

        try {
            const res = await fetch('/api/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await res.json();

            if (res.ok) {
                setStatus('success');
                setMessage(data.message);
                setEmail('');
            } else {
                setStatus('error');
                setMessage(data.error || 'Something went wrong.');
            }
        } catch (err) {
            setStatus('error');
            setMessage('Failed to connect. Please try again.');
        }
    };

    return (
        <div className="min-h-screen bg-black text-white selection:bg-purple-500/30 font-sans overflow-x-hidden relative">

            {/* Background Effects */}
            <div className="fixed inset-0 z-0">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-black to-black opacity-80" />
                <div className="absolute top-0 left-0 w-full h-full bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150"></div>
                {/* Simulated Particles (CSS Dots) */}
                <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-purple-500 rounded-full blur-[2px] animate-pulse"></div>
                <div className="absolute top-3/4 left-3/4 w-1 h-1 bg-blue-400 rounded-full blur-[1px] animate-pulse delay-75"></div>
                <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 bg-yellow-400 rounded-full blur-[2px] animate-ping delay-1000"></div>
            </div>

            {/* Navigation */}
            <nav className="relative z-10 p-6 flex justify-between items-center max-w-7xl mx-auto">
                <Link href="/" className="text-xl font-bold tracking-tighter flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-400" />
                    Trinity Symphony
                </Link>
                <Link href="/pulse/wisdom" className="text-sm text-gray-400 hover:text-white transition-colors">
                    View Live Pulse
                </Link>
            </nav>

            {/* Hero Section */}
            <main className="relative z-10 flex flex-col items-center justify-center min-h-[80vh] px-4 text-center max-w-4xl mx-auto">

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    className="space-y-6"
                >
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-purple-300 mb-4">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                        </span>
                        Identifying Co-Builders Now
                    </div>

                    <h1 className="text-5xl md:text-7xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-blue-100 to-purple-200 pb-2">
                        Join the AI Revolution <br /> <span className="text-white">for Good.</span>
                    </h1>

                    <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
                        Help build a decentralized, ethical AI ecosystem that values <span className="text-blue-300">Truth</span> and empowers people to <span className="text-purple-300">help people</span>.
                    </p>

                    <p className="text-sm md:text-md text-gray-500 max-w-xl mx-auto">
                        We’re creating agents that learn wisdom, fact-check for truth, and drive real inclusion in finance, education, and health — for the last, the lost, and the least.
                    </p>
                </motion.div>

                {/* CTA Form */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.4, duration: 0.5 }}
                    className="mt-12 w-full max-w-md"
                >
                    <form onSubmit={handleSubmit} className="relative group">
                        <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
                        <div className="relative flex items-center bg-black/80 backdrop-blur-xl border border-white/10 rounded-lg p-2 pr-2 shadow-2xl">
                            <input
                                type="email"
                                placeholder="name@example.com"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="flex-1 bg-transparent border-none outline-none text-white placeholder-gray-500 px-4 py-3"
                            />
                            <button
                                type="submit"
                                disabled={status === 'loading' || status === 'success'}
                                className="bg-white text-black font-semibold px-6 py-3 rounded-md hover:bg-gray-200 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {status === 'loading' ? 'Joining...' : 'Join the Spark'}
                                {status !== 'loading' && <ArrowRight className="w-4 h-4" />}
                            </button>
                        </div>
                    </form>
                    <p className="mt-4 text-xs text-center text-gray-600">
                        Zero spam. Only signal. Validating "Truth" in 3... 2... 1...
                    </p>
                </motion.div>

                {/* Feature Grid (Trust Signals) */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8 }}
                    className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8 text-left w-full max-w-5xl px-4"
                >
                    {[
                        { icon: ShieldCheck, title: "Truth-First AI", desc: "Agents incentivized by accuracy, not engagement." },
                        { icon: Heart, title: "Radical Empathy", desc: "Designed to uplift the marginalized and underserved." },
                        { icon: Zap, title: "Agentic Action", desc: "Not just chat. Real work, real tasks, real impact." }
                    ].map((feature, i) => (
                        <div key={i} className="p-6 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                            <feature.icon className="w-8 h-8 text-gray-400 mb-4" />
                            <h3 className="text-lg font-bold text-white mb-2">{feature.title}</h3>
                            <p className="text-sm text-gray-400">{feature.desc}</p>
                        </div>
                    ))}
                </motion.div>
            </main>

            {/* Success Modal / Poll Wizard */}
            <AnimatePresence>
                {status === 'success' && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
                    >
                        <PollWizard email={email} onClose={() => setStatus('idle')} />
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );
}

function PollWizard({ email, onClose }: { email: string, onClose: () => void }) {
    const [step, setStep] = useState(1);
    const [vote, setVote] = useState('');
    const [socials, setSocials] = useState({ linkedin: '', github: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleVote = (choice: string) => {
        setVote(choice);
        setStep(2);
    };

    const handleFinalSubmit = async () => {
        setIsSubmitting(true);
        await fetch('/api/join', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email,
                preferred_ecosystem: vote,
                linkedin_handle: socials.linkedin,
                github_handle: socials.github
            })
        });
        setStep(3); // Thank you screen
        setIsSubmitting(false);
    };

    return (
        <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            className="bg-[#0a0a0a] border border-white/10 rounded-2xl max-w-2xl w-full shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]"
        >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500"></div>

            <div className="p-8 overflow-y-auto">

                {/* STEP 1: RESONANCE VOTE */}
                {step === 1 && (
                    <div className="space-y-6 text-center">
                        <h2 className="text-2xl font-bold text-white">Which Mission Resonates Most?</h2>
                        <p className="text-gray-400">Help our agents route your onboarding. Pick one.</p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {[
                                { id: 'PurposeHub', name: 'PurposeHub.ai', desc: 'Connecting people to Impact Projects.', icon: '🌍' },
                                { id: 'ImageBearer', name: 'ImageBearer.org', desc: 'Restoring identity & dignity.', icon: '🛡️' },
                                { id: 'AISocialMirror', name: 'AISocialMirror.com', desc: 'Truth, Psychology & Self-Awareness.', icon: '🪞' },
                                { id: 'AIDebate', name: 'AIDebate.io', desc: 'Logic, Reason & Ethical Discourse.', icon: '⚖️' }
                            ].map((opt) => (
                                <button
                                    key={opt.id}
                                    onClick={() => handleVote(opt.id)}
                                    className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-purple-500/50 transition-all text-left group"
                                >
                                    <span className="text-2xl mb-2 block">{opt.icon}</span>
                                    <h3 className="font-bold text-white group-hover:text-purple-300">{opt.name}</h3>
                                    <p className="text-xs text-gray-500">{opt.desc}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* STEP 2: SHARE & CONNECT */}
                {step === 2 && (
                    <div className="space-y-6 text-center">
                        <div className="w-16 h-16 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Sparkles className="w-8 h-8 text-purple-400" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">Let's Build Together</h2>
                        <p className="text-gray-400 max-w-md mx-auto">
                            If you believe in <span className="text-white font-semibold">Democratized, Ethical AI</span>, connect with us.
                            We are looking for co-pilots.
                        </p>

                        <div className="space-y-4 max-w-sm mx-auto">
                            <input
                                type="text"
                                placeholder="LinkedIn Profile URL (Optional)"
                                className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-purple-500 outline-none"
                                value={socials.linkedin}
                                onChange={e => setSocials({ ...socials, linkedin: e.target.value })}
                            />
                            <input
                                type="text"
                                placeholder="GitHub Handle (Optional)"
                                className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-purple-500 outline-none"
                                value={socials.github}
                                onChange={e => setSocials({ ...socials, github: e.target.value })}
                            />
                        </div>

                        <div className="flex gap-3 justify-center pt-4">
                            <button onClick={() => setStep(1)} className="text-gray-500 hover:text-white text-sm px-4">Back</button>
                            <button
                                onClick={handleFinalSubmit}
                                disabled={isSubmitting}
                                className="bg-white text-black px-8 py-2 rounded-full font-bold hover:bg-gray-200"
                            >
                                {isSubmitting ? 'Saving...' : 'Complete Impact Profile'}
                            </button>
                        </div>
                    </div>
                )}

                {/* STEP 3: THANK YOU */}
                {step === 3 && (
                    <div className="space-y-6 text-center py-8">
                        <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto" />
                        <h2 className="text-3xl font-bold text-white">You're In.</h2>
                        <p className="text-gray-400 max-w-md mx-auto">
                            We have recorded your preference for <span className="text-purple-400 font-mono">{vote}</span>.
                            <br />Our agents are analyzing your fit now.
                        </p>

                        <div className="bg-white/5 p-6 rounded-xl border border-white/10 mt-8">
                            <p className="text-sm text-gray-300 italic mb-4">
                                "The best way to predict the future is to create it."
                            </p>
                            <a
                                href="https://twitter.com/intent/tweet?text=I%20just%20joined%20the%20Trinity%20Symphony.%20Building%20Safe%2C%20Ethical%20AI%20that%20uplifts%20humanity.%20%23AIForGood%20%23TrinityEcosystem"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block bg-[#1DA1F2] text-white px-6 py-2 rounded-full font-bold text-sm hover:opacity-90 transition-opacity"
                            >
                                Share the Vision on X
                            </a>
                        </div>

                        <button onClick={onClose} className="mt-8 text-gray-500 hover:text-white text-sm">
                            Close & Return to Earth
                        </button>
                    </div>
                )}

            </div>
        </motion.div>
    );
}
