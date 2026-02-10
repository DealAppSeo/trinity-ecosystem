'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function GlobalErrorBoundary({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        const handleError = (event: ErrorEvent) => {
            const error = event.error;
            // Log to console for dev
            console.error('🚨 Global Runtime Error:', error);

            // Log to Supabase for Swarm Healing
            if (error) {
                logRuntimeError(error.message, event.filename, event.lineno, error.stack);
            }
        };

        const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
            console.error('🚨 Unhandled Promise Rejection:', event.reason);
            logRuntimeError(String(event.reason), 'Promise', 0, String(event.reason));
        }

        window.addEventListener('error', handleError);
        window.addEventListener('unhandledrejection', handleUnhandledRejection);

        return () => {
            window.removeEventListener('error', handleError);
            window.removeEventListener('unhandledrejection', handleUnhandledRejection);
        };
    }, []);

    return <>{children}</>;
}

async function logRuntimeError(message: string, file?: string, line?: number, stack?: string) {
    try {
        await supabase.from('trinity_runtime_errors').insert({
            error_message: message,
            file_path: file,
            line_number: line,
            stack_trace: stack,
            status: 'pending',
            timestamp: new Date().toISOString()
        });
    } catch (e) {
        // Fail silently if logger fails to avoid infinite loops
        console.warn('Failed to log runtime error to DB', e);
    }
}
