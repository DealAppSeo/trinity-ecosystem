'use client';

import { useState } from 'react';

const DEMO_CLAIMS = [
    {
        id: 1,
        claim: "The BFT threshold is 51%",
        belief: 0.12,
        gate: 1,
        latency: 420,
        hash: "38193de052d7d43a580760092f53a2364b87e5203aa66da17c0764ed865f1396b"
    },
    {
        id: 2,
        claim: "ANFIS was invented by Lotfi Zadeh in 1965",
        belief: 0.05,
        gate: 2,
        latency: 1050,
        hash: "f4204d8029c7b952a2337bce4cdbd863c32e94754ab821eb1923c8ddb69324c1"
    },
    {
        id: 3,
        claim: "Trinity Symphony has 8 agents",
        belief: 0.08,
        gate: 1,
        latency: 380,
        hash: "82a9db5832a8ef1572d4235e184c2dd77d5b1284faafc2937be1eef4ca28d584"
    },
    {
        id: 4,
        claim: "The IdentityRegistry is at 0x1111111111111111111111111111111111111111",
        belief: 0.01,
        gate: 0,
        latency: 45,
        hash: "11e925b4260aa70bd0e25e1aafa14fceaa24d1aadbbf04f7626359f5fdb8542c"
    },
    {
        id: 5,
        claim: "HyperDAG work began in 2019",
        belief: 0.15,
        gate: 1,
        latency: 410,
        hash: "6e268a715a63964fcfba670a44280cdb900f6848fc88da0eaa2f7a9afbac1b9a"
    }
];

export default function PulseGate() {
    const [selectedClaim, setSelectedClaim] = useState<typeof DEMO_CLAIMS[0] | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const handleClaimClick = (claim: typeof DEMO_CLAIMS[0]) => {
        setIsProcessing(true);
        setSelectedClaim(null);
        setTimeout(() => {
            setSelectedClaim(claim);
            setIsProcessing(false);
        }, claim.latency);
    };

    return (
        <div className="min-h-screen bg-black text-gray-200 p-8 font-mono">
            <header className="mb-12 border-b border-gray-800 pb-4">
                <h1 className="text-3xl font-bold text-cyan-500 mb-2">Pulse Monitor // Threat Scanning UI</h1>
                <p className="text-gray-400">Live bypass routing to the AdversarialVerifierAgent.</p>
            </header>

            <main className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                <section>
                    <h2 className="text-xl font-semibold mb-6 text-gray-300">Injected Hallucination Vectors</h2>
                    <div className="flex flex-col gap-4">
                        {DEMO_CLAIMS.map((c) => (
                            <button
                                key={c.id}
                                onClick={() => handleClaimClick(c)}
                                disabled={isProcessing}
                                className="text-left px-6 py-4 bg-gray-900 border border-gray-800 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 group"
                            >
                                <span className="block text-sm text-cyan-600 mb-1">Vector #{c.id}</span>
                                <span className="block text-lg group-hover:text-cyan-400">"{c.claim}"</span>
                            </button>
                        ))}
                    </div>
                </section>

                <section className="bg-gray-900 rounded-xl border border-gray-800 p-8 h-[500px] flex flex-col justify-center relative overflow-hidden">
                    {isProcessing ? (
                        <div className="flex flex-col items-center justify-center h-full space-y-4">
                            <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-cyan-500 animate-pulse">Running BFT Consensus & Gate Verification...</p>
                        </div>
                    ) : selectedClaim ? (
                        <div className="space-y-6 animate-in fade-in duration-500">
                            <div className="bg-red-950/30 border border-red-900/50 p-4 rounded text-red-500 font-bold mb-8">
                                ❌ HALLUCINATION / FALSE CLAIM DETECTED
                            </div>
                            
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="text-xs text-gray-500 uppercase tracking-widest">Belief Score</label>
                                    <div className="text-2xl font-bold text-red-400">{selectedClaim.belief.toFixed(2)}</div>
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 uppercase tracking-widest">Verification Gate</label>
                                    <div className="text-2xl font-bold text-yellow-500">Gate {selectedClaim.gate}</div>
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 uppercase tracking-widest">Processing Latency</label>
                                    <div className="text-2xl font-bold text-green-400">{selectedClaim.latency} ms</div>
                                </div>
                            </div>

                            <div className="mt-8 pt-6 border-t border-gray-800">
                                <label className="text-xs text-gray-500 uppercase tracking-widest block mb-2">HMAC Tool Receipt Hash</label>
                                <div className="bg-black p-3 rounded text-xs text-emerald-500 break-all border border-gray-800/50">
                                    {selectedClaim.hash}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center text-gray-600">
                            Select a hallucination vector to initiate real-time verification.
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}
