
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Wallet, ShieldCheck, Zap, Globe } from 'lucide-react';

function JoinContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [web3Loading, setWeb3Loading] = useState(false);

    const [tier, setTier] = useState<'standard' | 'byok'>('standard');
    const [promoCode, setPromoCode] = useState('');
    const [byokKey, setByokKey] = useState('');

    useEffect(() => {
        const refCode = searchParams.get('ref');
        if (refCode) {
            console.log('🔗 Referral Detected:', refCode);
            setCode(refCode); // Auto-fill the code for UX
        }
    }, [searchParams]);

    const handleAccess = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const cleanPassword = password.trim();
        const cleanCode = code.trim().toLowerCase();

        // 1. Check Symphony Key (Founder Access - Level 2)
        const SYMPHONY_KEY = 'Symphony2026';
        const MASTER_KEY = 'JOHN316';

        if (cleanPassword === SYMPHONY_KEY || cleanPassword.toUpperCase() === MASTER_KEY) {
            console.log('👑 Founder Access Verified');
            localStorage.setItem('trinity_admin_key', cleanPassword);
            grantAccess('founder');
            return;
        }

        // 2. Process Early Adopter (Email + Tier + Optional BYOK)
        if (email && email.includes('@')) {
            try {
                const response = await fetch('/api/onboard', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email,
                        tier,
                        byok: tier === 'byok',
                        byok_key: byokKey,
                        promo_code: promoCode,
                        referral_from: code
                    })
                });

                if (!response.ok) throw new Error('Onboarding failed');

                console.log('✅ Early Adopter Registered');
                grantAccess('verified');
                return;
            } catch (err) {
                console.error('Failed to persist lead:', err);
                setError('Registration failed. Please try again.');
                setLoading(false);
                return;
            }
        }

        setError('Invalid Symphony Key or Access Code. Please enter your email for guest access.');
        setLoading(false);
    };

    const grantAccess = (role: 'founder' | 'guest' | 'verified') => {
        // ... [grantAccess implementation] ...
        const expiry = 60 * 60 * 24 * 365; // 1 Year
        document.cookie = `trinity_access=true; Path=/; Max-Age=${expiry}; SameSite=Lax`;
        document.cookie = `trinity_role=${role}; Path=/; Max-Age=${expiry}; SameSite=Lax`;

        localStorage.setItem('trinity_role', role);
        localStorage.setItem('trinity_access', 'true');

        console.log(`🔓 Access Granted as ${role}. Redirecting...`);

        setTimeout(() => {
            router.push('/pulse/conductor');
        }, 500);
    };

    return (
        <div className="max-w-2xl w-full space-y-12 flex flex-col items-center text-center px-4">
            {/* Header */}
            <div className="space-y-4">
                <h1 className="text-4xl md:text-6xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-zinc-400 to-white animate-pulse">
                    Democratizing Intelligence.
                </h1>
                <div className="h-1 w-24 bg-accent-violet rounded-full mx-auto" />
            </div>

            {/* Manifesto */}
            <div className="space-y-6 text-lg md:text-xl text-zinc-400 font-light leading-relaxed max-w-xl">
                <p>
                    We believe AI should be <span className="text-white font-bold">safe, ethical, and fact-checked</span>. Join the first system built on truth.
                </p>

                {/* Pricing Tiers */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8 text-left">
                    <button
                        onClick={() => setTier('standard')}
                        className={`p-6 rounded-2xl border transition-all group ${tier === 'standard' ? 'border-accent-violet bg-accent-violet/10' : 'border-white/5 bg-white/5 hover:border-white/10'}`}
                    >
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-accent-violet">Standard</span>
                            <span className="text-xl font-bold">$100<span className="text-xs text-zinc-500">/mo</span></span>
                        </div>
                        <p className="text-xs text-zinc-500">Managed infrastructure. Infinite peace of mind.</p>
                    </button>

                    <button
                        onClick={() => setTier('byok')}
                        className={`p-6 rounded-2xl border transition-all group ${tier === 'byok' ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/5 bg-white/5 hover:border-white/10'}`}
                    >
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">BYOK</span>
                            <span className="text-xl font-bold">$20<span className="text-xs text-zinc-500">/mo</span></span>
                        </div>
                        <p className="text-xs text-zinc-500">Plug in your own keys. Save up to 90%.</p>
                    </button>
                </div>
            </div>

            {/* Entry Gate */}
            <form onSubmit={handleAccess} className="space-y-8 w-full max-w-md">
                <div className="space-y-6">
                    <div className="text-left">
                        <label className="block text-[10px] uppercase tracking-[0.2em] text-zinc-600 mb-2 font-black">Email Address</label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@future.com"
                            className="w-full bg-zinc-900/50 border border-white/5 rounded-xl p-4 text-white focus:outline-none focus:border-accent-violet transition-all shadow-inner"
                        />
                    </div>

                    {tier === 'byok' && (
                        <div className="text-left animate-in slide-in-from-top duration-300">
                            <label className="block text-[10px] uppercase tracking-[0.2em] text-emerald-500 mb-2 font-black">OpenAI / Anthropic Key</label>
                            <input
                                type="text"
                                value={byokKey}
                                onChange={(e) => setByokKey(e.target.value)}
                                placeholder="sk-..."
                                className="w-full bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-4 text-white focus:outline-none focus:border-emerald-500 transition-all font-mono text-sm"
                            />
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 text-left">
                        <div>
                            <label className="block text-[10px] uppercase tracking-[0.2em] text-zinc-600 mb-2 font-black">Access Code</label>
                            <input
                                type="text"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                placeholder="SPARK"
                                className="w-full bg-zinc-900/50 border border-white/5 rounded-xl p-4 text-white focus:outline-none focus:border-accent-violet transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase tracking-[0.2em] text-zinc-600 mb-2 font-black">Discount</label>
                            <input
                                type="text"
                                value={promoCode}
                                onChange={(e) => setPromoCode(e.target.value)}
                                placeholder="EARLY50"
                                className="w-full bg-zinc-900/50 border border-white/5 rounded-xl p-4 text-white focus:outline-none focus:border-accent-violet transition-all"
                            />
                        </div>
                    </div>
                </div>

                <div className="pt-8 border-t border-white/5 text-left">
                    <label className="block text-[10px] uppercase tracking-[0.2em] text-amber-500/70 mb-2 font-black">Symphony Key (Founders Only)</label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 text-amber-400 focus:outline-none focus:border-amber-500 transition-all"
                    />
                </div>

                {error && <p className="text-red-400 text-xs font-medium animate-bounce">{error}</p>}

                <Button
                    type="submit"
                    disabled={loading}
                    className="w-full py-8 text-xl bg-white text-black hover:bg-zinc-200 transition-all rounded-2xl shadow-[0_20px_40px_rgba(255,255,255,0.1)] active:scale-95 disabled:opacity-50"
                >
                    {loading ? 'Processing...' : 'Secure Early Access'}
                </Button>
            </form>
        </div>
    );
}

export default function JoinPage() {
    return (
        <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 animate-in fade-in duration-1000">
            <Suspense fallback={<div className="text-white animate-pulse">Loading Gateway...</div>}>
                <JoinContent />
            </Suspense>
        </main>
    );
}
