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
        <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-obsidian-surface border border-accent-gold/20 shadow-glow-gold/10">
            <div
                className="w-full h-auto"
                dangerouslySetInnerHTML={{ __html: zkpBadgeGenerator.getBadgeSVG(agentName, 'Sovereign') }}
            />
            <div className="text-[10px] font-mono text-accent-gold opacity-70">
                PROOF: {proof.proof_hash.slice(0, 10)}...
            </div>
            <div className="text-[8px] uppercase tracking-tighter text-text-muted">
                Verified by Trinity RepID ZKP v1
            </div>
        </div>
    );
}
