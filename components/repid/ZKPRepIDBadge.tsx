'use client';

import { useEffect, useState } from 'react';
import { zkpBadgeGenerator } from '@/lib/guardrail/ZKPReputationBadge';

export function ZKPRepIDBadge({ agentName, minRep }: { agentName: string; minRep: number }) {
    const [proof, setProof] = useState<any>(null);

    useEffect(() => {
        zkpBadgeGenerator.generateProof(agentName, minRep).then(setProof);
    }, [agentName, minRep]);

    if (!proof) return <div className="animate-pulse h-10 w-32 bg-obsidian-surface rounded-lg" />;

    return (
        <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-obsidian-elevated border border-accent-violet/30 shadow-glow-violet/5 h-full min-h-[160px]">
            <div className="w-full flex items-center justify-center mb-4 scale-125">
                <div
                    className="w-full h-auto"
                    dangerouslySetInnerHTML={{ __html: zkpBadgeGenerator.getBadgeSVG(agentName, 'Sovereign') }}
                />
            </div>
            <div className="text-center space-y-1">
                <div className="text-[10px] font-mono text-cyan-400 font-bold tracking-widest uppercase">
                    Authenticity Proof
                </div>
                <div className="text-[9px] font-mono text-zinc-500 break-all">
                    {proof.proof_hash}
                </div>
                <div className="mt-4 pt-4 border-t border-white/5 text-[8px] uppercase tracking-[0.2em] text-zinc-600 font-black">
                    Trinity RepID • ZKP v1.0
                </div>
            </div>
        </div>
    );
}
