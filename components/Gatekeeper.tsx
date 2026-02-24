
'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';


import { useTelegram } from '@/hooks/useTelegram';

export function Gatekeeper() {
    const router = useRouter();
    const pathname = usePathname();
    const [authorized, setAuthorized] = useState(false);
    const { tg, isReady } = useTelegram();

    useEffect(() => {
        // 1. Allow public & Stakeholder routes
        const publicRoutes = ['/join', '/pulse/watch', '/pulse/agents'];
        if (publicRoutes.includes(pathname)) {
            setAuthorized(true);
            return;
        }

        // 2. Check for Telegram WebApp environment
        if (isReady && tg?.initData && !document.cookie.includes('trinity_access=')) {
            console.log('📱 [Gatekeeper] Telegram WebApp detected. Authenticating...');
            fetch('/api/auth/telegram', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData })
            }).then(async (res) => {
                if (res.ok) {
                    console.log('✅ [Gatekeeper] Telegram Auth Success');
                    setAuthorized(true);
                    window.location.reload(); // Refresh to ensure middleware catches cookies
                }
            });
            return;
        }

        // 3. Check for Access Token (Cookie)
        const cookieString = document.cookie || '';
        const hasAccess = cookieString.split(';').some((item) => item.trim().startsWith('trinity_access='));
        const roleMatch = cookieString.match(/trinity_role=([^;]+)/);
        const role = roleMatch ? roleMatch[1] : 'guest';

        console.log(`🔒 [Gatekeeper] Path: ${pathname} | Access: ${hasAccess} | Role: ${role}`);

        if (!hasAccess) {
            console.warn('⛔ [Gatekeeper] Access Denied. Redirecting to /join...');
            router.push('/join');
        } else {
            console.log(`✅ [Gatekeeper] Authorized as ${role}.`);
            setAuthorized(true);
        }
    }, [pathname, router]);

    // Optionally, return null (render nothing until checked) to prevent flash
    // But for now, we just redirect.
    return null;
}
