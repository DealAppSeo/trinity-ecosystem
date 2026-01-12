import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

let client;

if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️ Supabase environment variables missing! Using mock client for build safety.');

    // Anti-Fragile Mock Client: Return a chainable object that resolves to empty data
    // This supports .select().eq().order() and .channel().on().on().subscribe() chains
    // Anti-Fragile Mock Client (Proxy Method):
    // Universally handles any chain (e.g., .from().select().eq().order().limit().maybeSingle().csv())
    // without needing manual definitions. Prevents "is not a function" crashes.
    const createProxyMock = (resolvedData: any = []) => {
        return new Proxy({}, {
            get: (target, prop) => {
                // Determine if we should resolve (Promise-like behavior)
                if (prop === 'then') {
                    return (onfulfilled?: ((value: any) => any) | null, onrejected?: ((reason: any) => any) | null) => {
                        return Promise.resolve({ data: resolvedData, error: null }).then(onfulfilled, onrejected);
                    };
                }

                // Specific overrides for known terminal methods/props
                if (prop === 'on') {
                    // Subscription chaining
                    return () => createProxyMock([]);
                }
                if (prop === 'subscribe') {
                    return (cb?: any) => {
                        if (cb && typeof cb === 'function') setTimeout(() => cb('SUBSCRIBED'), 0);
                        return createProxyMock([]);
                    };
                }
                if (prop === 'unsubscribe') {
                    return () => { };
                }
                if (prop === 'url') return 'http://mock-supabase.local';
                if (prop === 'headers') return {};

                // Default: Return a function that returns the Proxy (infinite chaining)
                return () => createProxyMock(resolvedData);
            }
        });
    };

    client = {
        from: (table: string) => createProxyMock([]),
        channel: () => createProxyMock([]),
        removeChannel: () => { },
        auth: {
            getSession: () => Promise.resolve({ data: { session: null }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => { } } } }),
        },
        storage: {
            from: () => createProxyMock([])
        }
    } as any;

    client = {
        from: (table: string) => createMockBuilder([]),
        channel: () => mockChannel,
        removeChannel: () => { },
        auth: {
            getSession: () => Promise.resolve({ data: { session: null }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => { } } } }),
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
