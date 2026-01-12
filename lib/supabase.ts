import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

let client;

if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️ Supabase environment variables missing! Using mock client for build safety.');

    // Anti-Fragile Mock Client: Return a chainable object that resolves to empty data
    // This supports .select().eq().order() and .channel().on().on().subscribe() chains
    const createMockBuilder = (data: any = []) => {
        const builder: any = {
            select: () => builder,
            insert: () => builder,
            update: () => builder,
            delete: () => builder,
            upsert: () => builder,
            eq: () => builder,
            order: () => builder,
            limit: () => builder,
            single: () => {
                // Return a builder that resolves to a single object (or null) instead of array
                const singleBuilder = { ...builder };
                singleBuilder.then = (resolve: any) => resolve({ data: {}, error: null });
                return singleBuilder;
            },
            ilike: () => builder,
            // Promise compatibility
            then: (resolve: any) => resolve({ data: data, error: null }),
        };
        return builder;
    };

    const mockChannel = {
        on: () => mockChannel,
        subscribe: (cb?: any) => {
            // If callback provided, simulate SUBSCRIBED
            if (cb && typeof cb === 'function') cb('SUBSCRIBED');
            return mockChannel
        },
        unsubscribe: () => { },
    };

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
