#!/usr/bin/env npx tsx
/**
 * PHASE 1 TEST — FIRST CYCLE VERIFICATION
 * Fetches real BTC price, writes a complete mock cycle, and verifies Supabase.
 * Use this to confirm the pipeline is safe before enabling the 20-min loop.
 * 
 * Paste into your repo at: scripts/test-first-cycle.ts
 */

import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!;

async function testFirstCycle() {
    console.log('🧪 Starting Phase 1: First Cycle Test...');

    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.error('❌ Supabase credentials missing');
        process.exit(1);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const cycleId = uuidv4();
    const asset = 'BTC';

    try {
        // 1. Fetch Real Price from CoinGecko
        console.log(`  → Fetching real price for ${asset}...`);
        const cgRes = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
        const price = cgRes.data.bitcoin.usd;
        console.log(`  ✅ Current BTC Price: $${price}`);

        // 2. Insert Mock Regime
        console.log('  → Inserting mock regime...');
        const { data: regime, error: rErr } = await supabase
            .from('prediction_regimes')
            .insert({
                regime_type: 'NORMAL',
                regime_confidence: 0.85,
                detected_at: new Date().toISOString()
            })
            .select()
            .single();
        if (rErr) throw rErr;

        // 3. Insert Mock Signal
        console.log('  → Inserting mock signal...');
        const { error: sErr } = await supabase
            .from('prediction_signals')
            .insert({
                cycle_id: cycleId,
                agent_id: 'TestAgent_01',
                asset,
                modality: 'price_action',
                final_direction: 'BULLISH',
                confidence: 0.75,
                hallucination_risk: 0.1
            });
        if (sErr) throw sErr;

        // 4. Insert Mock Consensus
        console.log('  → Inserting mock consensus...');
        const { error: cErr } = await supabase
            .from('prediction_consensus')
            .insert({
                cycle_id: cycleId,
                asset,
                regime_id: regime.id,
                final_signal: 'BULLISH',
                consensus_direction: 'BULLISH',
                hitl_decision: 'APPROVED',
                initiated_at: new Date().toISOString()
            });
        if (cErr) throw cErr;

        // 5. Verify Reads
        console.log('  → Verifying database writes...');
        const { data: verify, error: vErr } = await supabase
            .from('prediction_consensus')
            .select('*, prediction_signals(*)')
            .eq('cycle_id', cycleId)
            .single();

        if (vErr || !verify) throw new Error('Verification failed: Row not found');
        console.log(`  ✅ Cycle verified! id=${verify.cycle_id} signals=${verify.prediction_signals.length}`);

        // 6. Cleanup (Optional, but good for tests)
        console.log('  → Cleaning up test data...');
        await supabase.from('prediction_signals').delete().eq('cycle_id', cycleId);
        await supabase.from('prediction_consensus').delete().eq('cycle_id', cycleId);
        await supabase.from('prediction_regimes').delete().eq('id', regime.id);

        console.log('\n✨ PHASE 1 TEST PASSED');
        console.log('System is ready for Phase 2 (20-minute autonomous loops).');

    } catch (e: any) {
        console.error(`\n❌ TEST FAILED: ${e.message}`);
        process.exit(1);
    }
}

testFirstCycle();
