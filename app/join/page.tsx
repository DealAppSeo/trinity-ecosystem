
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
        <div className="max-w-2xl w-full space-y-12">
            {/* Header */}
            <div className="space-y-6 text-center md:text-left">
                <h1 className="text-4xl md:text-5xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
                    Democratizing Intelligence.
                </h1>
                <div className="h-1 w-20 bg-purple-600 rounded-full mx-auto md:mx-0" />
            </div>

            {/* Manifesto */}
            <div className="space-y-6 text-lg md:text-xl text-gray-300 font-light leading-relaxed">
                <p>
                    We believe AI should be democratized, created to be <span className="text-white font-medium">safe</span> and <span className="text-white font-medium">ethical</span>.
                </p>
                <p>
                    Join our Early Adopter program and save 50-90% on AI costs by bringing your own API keys.
                </p>

                {/* Pricing Tiers */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
                    <button
                        onClick={() => setTier('standard')}
                        className={`p-6 rounded-2xl border transition-all text-left group ${tier === 'standard' ? 'border-purple-500 bg-purple-500/10' : 'border-white/5 bg-white/5 hover:border-white/10'}`}
                    >
                        <div className="flex justify-between items-start mb-4">
                            <span className="text-xs font-bold uppercase tracking-widest text-purple-400">Standard</span>
                            <span className="text-2xl font-bold">$100<span className="text-xs text-gray-500">/mo</span></span>
                        </div>
                        <p className="text-sm text-gray-400">Fixed cost, managed infrastructure. No keys required.</p>
                    </button>

                    <button
                        onClick={() => setTier('byok')}
                        className={`p-6 rounded-2xl border transition-all text-left group ${tier === 'byok' ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/5 bg-white/5 hover:border-white/10'}`}
                    >
                        <div className="flex justify-between items-start mb-4">
                            <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">BYOK</span>
                            <span className="text-2xl font-bold">$20<span className="text-xs text-gray-500">/mo</span></span>
                        </div>
                        <p className="text-sm text-gray-400">Founder-Lite. Plug in your own OpenAI/Anthropic keys.</p>
                    </button>
                </div>
            </div>

            {/* Entry Gate */}
            <form onSubmit={handleAccess} className="space-y-6 max-w-md">
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs uppercase tracking-widest text-gray-500 mb-2">Email Address</label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@future.com"
                            className="w-full bg-gray-900 border border-gray-800 rounded-md p-4 text-white focus:outline-none focus:border-purple-500 transition-colors"
                        />
                    </div>

                    {tier === 'byok' && (
                        <div>
                            <label className="block text-xs uppercase tracking-widest text-emerald-500 mb-2">Your API Key (Optional for now)</label>
                            <input
                                type="text"
                                value={byokKey}
                                onChange={(e) => setByokKey(e.target.value)}
                                placeholder="sk-..."
                                className="w-full bg-emerald-950/20 border border-emerald-500/20 rounded-md p-4 text-white focus:outline-none focus:border-emerald-500 transition-colors font-mono text-sm"
                            />
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs uppercase tracking-widest text-gray-500 mb-2">Access Code</label>
                            <input
                                type="text"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                placeholder="SPARK"
                                className="w-full bg-gray-900 border border-gray-800 rounded-md p-4 text-white focus:outline-none focus:border-purple-500 transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-xs uppercase tracking-widest text-gray-500 mb-2">Discount Code</label>
                            <input
                                type="text"
                                value={promoCode}
                                onChange={(e) => setPromoCode(e.target.value)}
                                placeholder="EARLY50"
                                className="w-full bg-gray-900 border border-gray-800 rounded-md p-4 text-white focus:outline-none focus:border-purple-500 transition-colors"
                            />
                        </div>
                    </div>
                </div>

                <div className="pt-6 border-t border-white/5">
                    <label className="block text-xs uppercase tracking-widest text-gold mb-2">Symphony Key (Founders Only)</label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-gold/5 border border-gold/20 rounded-md p-4 text-gold focus:outline-none focus:border-gold transition-colors"
                    />
                </div>

                {error && <p className="text-red-400 text-sm">{error}</p>}

                <Button
                    type="submit"
                    disabled={loading}
                    className="w-full py-6 text-lg bg-white text-black hover:bg-gray-200 transition-colors shadow-xl shadow-white/5"
                >
                    {loading ? 'Processing...' : 'Secure Early Access →'}
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
