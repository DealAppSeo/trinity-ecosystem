'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Lock, ArrowRight, Loader } from 'lucide-react';

export default function AccessGatePage() {
    const [code, setCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();

    const handleAccess = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            // Direct integration for now, or fetch API
            // Ideally we call an API route /api/access/validate
            // For MVP, if code is 'TRINITY-ALPHA-777', set cookie & reload
            // REAL IMPLEMENTATION: fetch('/api/access/validate', ...)

            const res = await fetch('/api/access/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
            });

            const data = await res.json();

            if (res.ok && data.success) {
                // Reload to let middleware redirect to dashboard
                window.location.reload();
            } else {
                setError(data.message || 'Invalid Access Code');
            }
        } catch (err) {
            setError('Connection failed. Try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full bg-[#0F0F0F] flex items-center justify-center p-4">
            {/* Background Ambience */}
            <div className="absolute inset-0 bg-[#00D4FF]/5 pointer-events-none" />
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#00D4FF] to-transparent opacity-50" />

            <div className="relative w-full max-w-md bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl overflow-hidden">
                {/* Glow Element */}
                <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-[#00D4FF]/5 blur-[100px] pointer-events-none animate-pulse" />

                <div className="relative z-10 flex flex-col items-center text-center">
                    <div className="w-16 h-16 rounded-full bg-[#00D4FF]/10 flex items-center justify-center mb-6 border border-[#00D4FF]/30 shadow-[0_0_30px_-5px_#00D4FF]">
                        <ShieldCheck className="w-8 h-8 text-[#00D4FF]" />
                    </div>

                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-white to-white/60 mb-2 font-geist">
                        Restricted Access
                    </h1>
                    <p className="text-white/40 text-sm mb-8 font-geist-mono">
                        Controller Subdomain | Trinity Symphony
                    </p>

                    <form onSubmit={handleAccess} className="w-full space-y-4">
                        <div className="relative group">
                            <input
                                type="text"
                                value={code}
                                onChange={(e) => setCode(e.target.value.toUpperCase())}
                                placeholder="ENTER ACCESS CODE"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 pl-11 text-white placeholder-white/20 focus:outline-none focus:border-[#00D4FF]/50 focus:ring-1 focus:ring-[#00D4FF]/50 transition-all font-geist-mono tracking-wider text-center"
                            />
                            <Lock className="absolute left-4 top-3.5 w-4 h-4 text-white/30 group-focus-within:text-[#00D4FF] transition-colors" />
                        </div>

                        {error && (
                            <div className="text-red-400 text-xs font-geist-mono bg-red-500/10 border border-red-500/20 py-2 rounded">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading || !code}
                            className="w-full h-12 bg-[#00D4FF] hover:bg-[#00B4D8] text-black font-semibold rounded-lg transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <Loader className="w-5 h-5 animate-spin" />
                            ) : (
                                <>
                                    <span className="tracking-wide">AUTHENTICATE</span>
                                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-8 pt-6 border-t border-white/5 w-full">
                        <p className="text-xs text-white/20">
                            Only authorized Conductors may enter this domain.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
