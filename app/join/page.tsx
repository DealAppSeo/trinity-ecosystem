
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

        // 2. Check Access Code (Verified Access - Level 1)
        // Note: In a real app, this would check a DB for activated invite codes
        const VERIFIED_CODES = ['trinity', 'genesis', 'alpha'];
        if (VERIFIED_CODES.includes(cleanCode)) {
            console.log('✅ Verified Access Granted');
            grantAccess('verified');
            return;
        }

        // 3. Guest Access (Soft Gate - Level 0)
        if (cleanCode === 'mel' || cleanCode === 'spark' || (email && email.includes('@'))) {
            console.log('👀 Guest Access Granted (Read-Only)');

            // Persist Lead if email provided
            if (email && email.includes('@')) {
                try {
                    await fetch('/api/join', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, referral_from: code })
                    });
                } catch (err) {
                    console.error('Failed to persist lead:', err);
                }
            }

            grantAccess('guest');
            return;
        }

        setError('Invalid Symphony Key or Access Code. Please enter your email for guest access.');
        setLoading(false);
    };

    const grantAccess = (role: 'founder' | 'guest' | 'verified') => {
        // Set Cookies with broader scope and modern flags
        const expiry = 60 * 60 * 24 * 365; // 1 Year
        document.cookie = `trinity_access=true; Path=/; Max-Age=${expiry}; SameSite=Lax`;
        document.cookie = `trinity_role=${role}; Path=/; Max-Age=${expiry}; SameSite=Lax`;

        // LocalStorage fallback for non-middleware checks
        localStorage.setItem('trinity_role', role);
        localStorage.setItem('trinity_access', 'true');

        console.log(`🔓 Access Granted as ${role}. Redirecting...`);

        // Redirect
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
                    If you agree that AI should be for the people—not just the largest corporations—and that it should empower financial, educational, and healthcare inclusion...
                </p>
                <p className="italic text-purple-400">
                    Join us, to learn how we, and the agents we build, help people help people.
                </p>

                {/* [PHASE 13] WEB3 ONBOARDING SECTION */}
                <div className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                        onClick={async () => {
                            setWeb3Loading(true);
                            // Simulate Privy/Dynamic Onboarding
                            setTimeout(() => {
                                console.log("🌐 [Web3] Wallet Connected via ERC-8004 Discovery");
                                grantAccess('verified');
                            }, 2000);
                        }}
                        disabled={web3Loading}
                        className="flex items-center justify-center gap-3 p-4 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-xl hover:from-violet-500 hover:to-indigo-500 transition-all shadow-lg shadow-violet-500/20 group overflow-hidden relative"
                    >
                        {web3Loading ? (
                            <Zap className="w-5 h-5 animate-spin" />
                        ) : (
                            <Wallet className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        )}
                        <span className="font-bold tracking-tight">
                            {web3Loading ? 'Syncing RepID...' : 'Connect Wallet'}
                        </span>

                        {/* Shimmer Effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" />
                    </button>

                    <div className="flex items-center gap-3 p-4 glass rounded-xl border border-white/5 opacity-60">
                        <ShieldCheck className="w-5 h-5 text-emerald-400" />
                        <span className="text-xs font-medium text-gray-400">Reputation Backed (ERC-8004)</span>
                    </div>
                </div>
            </div>

            {/* Entry Gate */}
            <form onSubmit={handleAccess} className="space-y-4 max-w-md">

                {/* Email Input */}
                <div>
                    <label className="block text-xs uppercase tracking-widest text-gray-500 mb-2">Email Address</label>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@future.com"
                        className="w-full bg-gray-900 border border-gray-800 rounded-md p-4 text-white focus:outline-none focus:border-purple-500 transition-colors"
                    />
                </div>

                {/* Access Code Input */}
                <div>
                    <label className="block text-xs uppercase tracking-widest text-gray-500 mb-2">Access Code (Guest)</label>
                    <input
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="e.g. SPARK"
                        className="w-full bg-gray-900 border border-gray-800 rounded-md p-4 text-white focus:outline-none focus:border-purple-500 transition-colors"
                    />
                </div>

                {/* Symphony Key Input */}
                <div className="pt-4 border-t border-white/5">
                    <label className="block text-xs uppercase tracking-widest text-gold mb-2">Symphony Key (Founder)</label>
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
                    className="w-full py-6 text-lg bg-white text-black hover:bg-gray-200 transition-colors"
                >
                    {loading ? 'Verifying...' : 'Enter Ecosystem →'}
                </Button>

                <p className="text-xs text-gray-600 text-center pt-4">
                    Unlock advanced features by connecting GitHub or LinkedIn later.
                </p>
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
