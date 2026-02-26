'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function PulseGateContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const inviteCode = searchParams.get('i');

    useEffect(() => {
        const hasAccess = localStorage.getItem('trinity_access');

        // 1. Check for invite code (Instant Access)
        if (inviteCode) {
            localStorage.setItem('trinity_access', 'true');
            router.replace('/pulse/watch');
            return;
        }

        // 2. Check prior access
        if (hasAccess) {
            router.replace('/pulse/watch');
            return;
        }

        // 3. No access -> Guest Exploration
        router.replace('/pulse/conductor');

    }, [inviteCode, router]);

    return (
        <div className="min-h-screen bg-obsidian-base flex items-center justify-center">
            <div className="animate-pulse flex flex-col items-center gap-4">
                <div className="text-4xl">💎</div>
                <p className="text-text-muted font-mono text-sm">Verifying Signature...</p>
            </div>
        </div>
    );
}

export default function PulseGate() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-obsidian-base flex items-center justify-center">
                <div className="animate-pulse flex flex-col items-center gap-4">
                    <div className="text-4xl">💎</div>
                </div>
            </div>
        }>
            <PulseGateContent />
        </Suspense>
    );
}
