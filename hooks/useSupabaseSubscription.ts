'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export function useSupabaseSubscription(
    table: string,
    callback: (payload: any) => void,
    event: 'INSERT' | 'UPDATE' | 'DELETE' | '*' = '*'
) {
    const router = useRouter();

    useEffect(() => {
        const channel = supabase
            .channel(`realtime-${table}`)
            .on(
                'postgres_changes',
                { event: event as any, schema: 'public', table: table },
                (payload) => {
                    callback(payload);
                    router.refresh();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [table, event, callback, router]);
}
