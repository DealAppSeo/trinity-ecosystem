
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';

export default function JoinPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleAccess = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        // 1. Check Access Code (Backdoor)
        if (code.toLowerCase() === 'mel') {
            grantAccess();
            return;
        }

        // 2. Check Email (Simulation)
        if (email && email.includes('@')) {
            // TODO: Log lead to Supabase
            console.log('📝 Lead Captured:', email);
            grantAccess();
            return;
        }

        setError('Please enter a valid Access Code or Email.');
        setLoading(false);
    };

    const grantAccess = () => {
        // Set Cookie
        document.cookie = "trinity_access=true; path=/; max-age=31536000"; // 1 Year
        console.log('🔓 Access Granted.');

        // Redirect
        setTimeout(() => {
            router.push('/');
        }, 500);
    };

    return (
        <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 animate-in fade-in duration-1000">

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
                        <label className="block text-xs uppercase tracking-widest text-gray-500 mb-2">Or Access Code</label>
                        <input
                            type="text"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            placeholder="Access Code"
                            className="w-full bg-gray-900 border border-gray-800 rounded-md p-4 text-white focus:outline-none focus:border-purple-500 transition-colors"
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
        </main>
    );
}
