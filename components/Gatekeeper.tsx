
'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';


export function Gatekeeper() {
    const router = useRouter();
    const pathname = usePathname();
    const [authorized, setAuthorized] = useState(false);

    useEffect(() => {
        // 1. Allow public routes
        if (pathname === '/join') {
            setAuthorized(true);
            return;
        }

        // 2. Check for Access Token (Cookie)
        const cookieString = document.cookie || '';
        const hasAccess = cookieString.split(';').some((item) => item.trim().startsWith('trinity_access='));

        console.log(`🔒 [Gatekeeper] Path: ${pathname} | Access: ${hasAccess} | Cookie: ${cookieString}`);

        if (!hasAccess) {
            console.warn('⛔ [Gatekeeper] Access Denied. Redirecting to /join...');
            router.push('/join');
        } else {
            console.log('✅ [Gatekeeper] Authorized.');
            setAuthorized(true);
        }
    }, [pathname, router]);

    // Optionally, return null (render nothing until checked) to prevent flash
    // But for now, we just redirect.
    return null;
}
