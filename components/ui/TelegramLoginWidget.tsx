'use client';

import { useEffect, useRef } from 'react';
import { useTelegram } from '@/hooks/useTelegram';
import { cn } from '@/lib/utils';

interface TelegramLoginWidgetProps {
    className?: string;
    onAuth?: (user: any) => void;
}

export function TelegramLoginWidget({ className, onAuth }: TelegramLoginWidgetProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const { isReady } = useTelegram();

    useEffect(() => {
        // Prevent multiple injections
        if (!containerRef.current || containerRef.current.hasChildNodes()) return;

        const script = document.createElement('script');
        script.src = 'https://telegram.org/js/telegram-widget.js?22';
        script.setAttribute('data-telegram-login', 'TrinitySymphonyBot'); // Replaced with likely username, ideally should be dynamic
        script.setAttribute('data-size', 'large');
        script.setAttribute('data-radius', '10');
        script.setAttribute('data-onauth', 'onTelegramAuth(user)');
        script.setAttribute('data-request-access', 'write');
        script.async = true;

        // Define global callback
        (window as any).onTelegramAuth = async (user: any) => {
            console.log('📱 [Telegram Widget] Auth Success:', user);

            // Trigger our existing auth flow
            const res = await fetch('/api/auth/telegram', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: user }) // Note: Widget returns a user object, not initData string
            });

            if (res.ok) {
                if (onAuth) onAuth(user);
                window.location.reload();
            }
        };

        containerRef.current.appendChild(script);
    }, [onAuth]);

    return (
        <div
            ref={containerRef}
            className={cn("flex justify-center items-center py-4", className)}
        />
    );
}
