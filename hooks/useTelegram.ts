'use client';

import { useEffect, useState } from 'react';

export function useTelegram() {
    const [tg, setTg] = useState<any>(null);

    useEffect(() => {
        if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
            const webapp = (window as any).Telegram.WebApp;
            webapp.ready();
            webapp.expand();
            setTg(webapp);
        }
    }, []);

    const onClose = () => tg?.close();

    const onToggleButton = () => {
        if (tg?.MainButton.isVisible) {
            tg?.MainButton.hide();
        } else {
            tg?.MainButton.show();
        }
    };

    const triggerHaptic = (type: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'light') => {
        tg?.HapticFeedback.impactOccurred(type);
    };

    return {
        tg,
        user: tg?.initDataUnsafe?.user,
        queryId: tg?.initDataUnsafe?.query_id,
        onClose,
        onToggleButton,
        triggerHaptic,
        isReady: !!tg
    };
}
