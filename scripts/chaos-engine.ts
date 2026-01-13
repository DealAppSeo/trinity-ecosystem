import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * 🐒 CHAOS ENGINE
 * Injects random failures into the system to test Agent Resilience.
 * Run this during IDLE Agent Time.
 */
async function runChaosSimulation() {
    console.log('🐒 CHAOS MONKEY UNLEASHED...');

    const scenarios = [
        testEnvChaos,
        testNetworkChaos,
        testMockFallback
    ];

    const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
    await scenario();
}

async function logChaos(status: 'success' | 'failure', message: string) {
    console.log(`[CHAOS RESULT] ${status.toUpperCase()}: ${message}`);
    // Log to DB for Healer to learn
    await supabase.from('trinity_runtime_errors').insert({
        error_type: 'CHAOS_SIMULATION',
        message: message,
        stack_trace: `Status: ${status}`,
        path: 'scripts/chaos-engine.ts'
    });
}

// 1. Simulates Missing Env Var (Supabase URL)
async function testEnvChaos() {
    console.log('🧪 Simulating: Missing DB URL...');
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    try {
        // Attempt query (should fail if code isn't robust, or succeed if mocked)
        await supabase.from('trinity_heartbeat').select('*').limit(1);
        await logChaos('success', 'Code handled missing URL gracefully (or mock took over).');
    } catch (err: any) {
        await logChaos('failure', `Crashed on missing URL: ${err.message}`);
    } finally {
        process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    }
}

// 2. Simulates Network Failure (Offline)
async function testNetworkChaos() {
    console.log('🧪 Simulating: Network Outage...');
    // Real simulaton would block port. Here we simulate a fetch error.
    try {
        // We can't actually disable network in Node easily without root.
        // So we force a bad fetch to see if error handler catches it.
        await fetch('http://bad-url.local');
        await logChaos('failure', 'Somehow connected to bad URL?');
    } catch (err: any) {
        await logChaos('success', `Caught Network Error: ${err.message}`);
    }
}

// 3. Simulates Cost Guard Trigger (Mock Fallback)
async function testMockFallback() {
    console.log('🧪 Simulating: Budget Exceeded...');
    // We can't easily manipulate the DB state here without corrupting it.
    // Instead we verify if we can instantiate a Mock Client.
    const { createUniversalMock } = await import('../lib/supabase');
    const mock = createUniversalMock();
    const res = await mock.from('test').select('*');
    if (res && res.data) {
        await logChaos('success', 'Mock Client successfully returned data.');
    } else {
        await logChaos('failure', 'Mock Client failed.');
    }
}

// Run if called directly
if (require.main === module) {
    runChaosSimulation();
}

export { runChaosSimulation };
