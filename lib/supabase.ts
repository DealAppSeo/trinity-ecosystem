
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// 1. Environment Variable Extraction (Strict Differentiation)
let PUBLIC_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
let PUBLIC_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Detect Build vs Runtime
const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build';
// Fix: Use NODE_ENV for client-side production detection as RAILWAY_ENVIRONMENT is not NEXT_PUBLIC
const isProduction = process.env.NODE_ENV === 'production';

// ------------------------------------------------------------------
// ENVIRONMENT VALIDATION
// ------------------------------------------------------------------
if (!PUBLIC_URL && isProduction && !isBuildTime) {
    console.error("❌ [Supabase] Missing NEXT_PUBLIC_SUPABASE_URL. Swarm requires this for telemetry.");
}
if (!PUBLIC_KEY && isProduction && !isBuildTime) {
    console.error("❌ [Supabase] Missing NEXT_PUBLIC_SUPABASE_ANON_KEY. Swarm required this for public view.");
}

let client: SupabaseClient;

// ------------------------------------------------------------------
// MOCK UTILITIES (Anti-Fragile Fallback)
// ------------------------------------------------------------------
async function logMockCall(method: string, args: any[]) {
    // Only log if we have a service key (Backdoor Channel)
    if (SERVICE_KEY && PUBLIC_URL) {
        try {
            await fetch(`${PUBLIC_URL}/rest/v1/trinity_mock_calls`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SERVICE_KEY}`,
                    'apikey': SERVICE_KEY
                },
                body: JSON.stringify({
                    method,
                    args: JSON.stringify(args),
                    timestamp: new Date().toISOString(),
                    status: 'pending'
                })
            });
        } catch (e) {
            // Silent fail
        }
    }
    if (process.env.NODE_ENV === 'development') {
        console.groupCollapsed(`[Supabase-Mock] 👻 .${method}()`);
        console.log(args);
        console.groupEnd();
    }
}

export const createUniversalMock = (resolvedData: any = []): any => {
    return new Proxy({}, {
        get: (target, prop: string) => {
            if (prop === 'then') {
                return (onfulfilled?: ((value: any) => any) | null, onrejected?: ((reason: any) => any) | null) => {
                    logMockCall('then', ['deferred_resolution']);
                    return Promise.resolve({ data: resolvedData, error: null }).then(onfulfilled, onrejected);
                };
            }
            if (prop === 'single' || prop === 'maybeSingle') {
                return () => ({
                    then: (cb: any) => cb({ data: null, error: null })
                });
            }
            if (prop === 'select') {
                return (...args: any[]) => {
                    logMockCall('select', args);
                    return createUniversalMock([]);
                }
            }
            if (['insert', 'update', 'upsert', 'delete'].includes(prop)) {
                return (...args: any[]) => {
                    logMockCall(prop, args);
                    return createUniversalMock([{ status: 201, statusText: 'Mock Success' }]);
                }
            }
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

            return (...args: any[]) => {
                logMockCall(prop, args);
                return createUniversalMock(resolvedData);
            };
        }
    });
};

const createMockClient = () => ({
    from: (table: string) => createUniversalMock([]),
    channel: () => createUniversalMock([]),
    removeChannel: () => { },
    auth: {
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => { } } } }),
        signInWithOAuth: () => Promise.resolve({ data: null, error: null }),
        signOut: () => Promise.resolve({ error: null }),
    },
    storage: {
        from: () => createUniversalMock([])
    },
    functions: {
        invoke: () => Promise.resolve({ data: null, error: null })
    }
} as unknown as SupabaseClient<any, "public", any>);

// ------------------------------------------------------------------
// CLIENT INITIALIZATION
// ------------------------------------------------------------------

if (!PUBLIC_URL || !PUBLIC_KEY) {
    if (isProduction && !isBuildTime) {
        console.warn('⚠️ [Supabase] FATAL: Credentials missing in production. Falling back to Mock to prevent UI crash.');
    } else {
        console.warn(`⚠️ [Supabase] Missing credentials during ${isBuildTime ? 'BUILD' : 'DEV'}. Fallback to Mock.`);
    }
    client = createMockClient();
} else {
    try {
        client = createClient(PUBLIC_URL, PUBLIC_KEY);
    } catch (e: any) {
        console.error('[Supabase] Init failed:', e.message);
        client = createMockClient();
    }
}

export const supabase = client;

// [ANTIGRAVITY] Admin Client (Service Role)
// Never instantiated if URL is missing to prevent build-time crashes
export const supabaseAdmin = (SERVICE_KEY && PUBLIC_URL)
    ? createClient(PUBLIC_URL, SERVICE_KEY, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })
    : client; // Fallback to public client (or mock) if no service key

export const isMockMode = !PUBLIC_URL || !PUBLIC_KEY;

