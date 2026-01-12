import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

let client;

if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️ Supabase environment variables missing! Using mock client for build safety.');

    // Anti-Fragile Mock Client (Hybrid Universal Proxy)
    // 1. Logs calls for agent learning (console-only during mock mode)
    // 2. Handles specific Supabase methods (single, maybeSingle) with realistic empty returns
    // 3. Universally handles all other chains via Proxy
    const createUniversalMock = (resolvedData: any = []) => {
        return new Proxy({}, {
            get: (target, prop: string) => {
                // Promise Resolution (End of Chain)
                if (prop === 'then') {
                    return (onfulfilled?: ((value: any) => any) | null, onrejected?: ((reason: any) => any) | null) => {
                        return Promise.resolve({ data: resolvedData, error: null }).then(onfulfilled, onrejected);
                    };
                }

                // Specific Handlers for Terminal Methods
                if (prop === 'single' || prop === 'maybeSingle') {
                    return () => ({
                        then: (cb: any) => cb({ data: null, error: null })
                    });
                }

                // Realtime Handlers
                if (prop === 'on') return () => createUniversalMock([]);
                if (prop === 'subscribe') {
                    return (cb?: any) => {
                        if (cb && typeof cb === 'function') setTimeout(() => cb('SUBSCRIBED'), 0);
                        return createUniversalMock([]);
                    };
                }
                if (prop === 'unsubscribe') return () => { };
                if (prop === 'url') return 'http://mock-supabase.local';
                if (prop === 'headers') return {};

                // Default: Log & Continue Chain
                return (...args: any[]) => {
                    // In a real scenario, we'd log this to a file or endpoint for agents to learn
                    // console.debug(`[MOCK_CALL] ${prop}`, args); 
                    return createUniversalMock(resolvedData);
                };
            }
        });
    };

    client = {
        from: (table: string) => createUniversalMock([]),
        channel: () => createUniversalMock([]),
        removeChannel: () => { },
        auth: {
            getSession: () => Promise.resolve({ data: { session: null }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => { } } } }),
        },
        storage: {
            from: () => createUniversalMock([])
        }
    } as any;

    // Attempt to log error (fire and forget)
    if (typeof window === 'undefined') {
        const missing = [];
        if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
        if (!supabaseKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');

        console.error(JSON.stringify({
            event: 'TRINITY_ENV_ERROR',
            missing_vars: missing,
            service: 'trinity-ecosystem',
            timestamp: new Date().toISOString()
        }));
    }

} else {
    client = createClient(supabaseUrl, supabaseKey);
}

export const supabase = client;
export const isMockMode = !supabaseUrl || !supabaseKey;
