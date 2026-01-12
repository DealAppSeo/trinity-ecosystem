
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Environment Variable Check
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

let client: SupabaseClient;

// ------------------------------------------------------------------
// LOGGING UTILITY (Swarm Wisdom)
// Used by Mock to feed data to the Healer
// ------------------------------------------------------------------
async function logMockCall(method: string, args: any[]) {
    // Only log if we have a service key (Backdoor Channel)
    if (serviceKey && supabaseUrl) {
        try {
            // Lazy / Stateless fetch to avoid circular deps or client overlap
            await fetch(`${supabaseUrl}/rest/v1/trinity_mock_calls`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${serviceKey}`,
                    'apikey': serviceKey
                },
                body: JSON.stringify({
                    method,
                    args: JSON.stringify(args), // Sanitize?
                    timestamp: new Date().toISOString(),
                    status: 'pending' // Ready for Healer
                })
            });
        } catch (e) {
            // Silent fail - don't crash the mock
            // console.warn('Mock log failed');
        }
    }
    // Always console for debugging
    if (process.env.NODE_ENV === 'development') {
        console.groupCollapsed(`[Mock] 👻 .${method}()`);
        console.log(args);
        console.groupEnd();
    }
}

// ------------------------------------------------------------------
// CLIENT INITIALIZATION
// ------------------------------------------------------------------

if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️ Supabase environment variables missing! Using Anti-Fragile Mock Client.');

    // Anti-Fragile Mock Client (Global Universal Proxy)
    // 1. Logs calls for agent learning (trinity_mock_calls)
    // 2. Handles specific Supabase methods (single, maybeSingle, on, subscribe)
    // 3. Universally handles all other chains via Proxy
    // 4. Returns safe empties to prevent crashes

    const createUniversalMock = (resolvedData: any = []): any => {
        return new Proxy({}, {
            get: (target, prop: string) => {
                // A. Promise Resolution (End of Chain)
                if (prop === 'then') {
                    return (onfulfilled?: ((value: any) => any) | null, onrejected?: ((reason: any) => any) | null) => {
                        logMockCall('then', ['metrics_logged']);
                        return Promise.resolve({ data: resolvedData, error: null }).then(onfulfilled, onrejected);
                    };
                }

                // B. Specific Handlers for Terminal Methods
                if (prop === 'single' || prop === 'maybeSingle') {
                    return () => ({
                        then: (cb: any) => cb({ data: null, error: null })
                    });
                }

                if (prop === 'select') {
                    return (...args: any[]) => {
                        logMockCall('select', args);
                        return createUniversalMock([]); // Return chain
                    }
                }

                if (prop === 'insert' || prop === 'update' || prop === 'upsert' || prop === 'delete') {
                    return (...args: any[]) => {
                        logMockCall(prop, args);
                        // Return mock that resolves to success
                        return createUniversalMock([{ status: 201, statusText: 'Mock Success' }]);
                    }
                }

                // C. Realtime Handlers (Websockets)
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

                // D. Default: Log & Continue Chain
                return (...args: any[]) => {
                    logMockCall(prop, args);
                    return createUniversalMock(resolvedData);
                };
            }
        });
    };

    // Cast as "unknown" first to bypass strict type checks, then as SupabaseClient
    // This empowers the mock to "pretend" to be the rigorous typed client
    client = {
        from: (table: string) => {
            if (table === 'trinity_agent_registry') {
                const shadowSwarm = [
                    { id: 'mock-01', agent_name: 'Trinity Orchestrator', status: 'active', tier: 1 },
                    { id: 'mock-02', agent_name: 'Workflow Monitor', status: 'active', tier: 2 },
                    { id: 'mock-03', agent_name: 'Data Ingest 1', status: 'active', tier: 3 },
                    { id: 'mock-04', agent_name: 'Data Ingest 2', status: 'active', tier: 3 },
                    { id: 'mock-05', agent_name: 'Data Ingest 3', status: 'active', tier: 3 },
                    { id: 'mock-06', agent_name: 'Visual Output', status: 'active', tier: 3 },
                    { id: 'mock-07', agent_name: 'Analytics Engine 1', status: 'active', tier: 2 },
                    { id: 'mock-08', agent_name: 'Analytics Engine 2', status: 'active', tier: 2 },
                    { id: 'mock-09', agent_name: 'Security Sentinel', status: 'active', tier: 1 },
                    { id: 'mock-10', agent_name: 'Quality Assurance', status: 'active', tier: 2 },
                    { id: 'mock-11', agent_name: 'Deployment Manager', status: 'active', tier: 1 },
                    { id: 'mock-12', agent_name: 'Feedback Loop', status: 'active', tier: 2 }
                ];
                return createUniversalMock(shadowSwarm);
            }
            return createUniversalMock([]);
        },
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
    } as unknown as SupabaseClient<any, "public", any>;

    // Log environmental error for the Swarm to see
    if (typeof window === 'undefined') {
        const missing = [];
        if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
        if (!supabaseKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
        console.error(`[Anti-Fragile] Active. Missing: ${missing.join(', ')}`);
    }

} else {
    client = createClient(supabaseUrl, supabaseKey);
}

export const supabase = client;
export const isMockMode = !supabaseUrl || !supabaseKey;
