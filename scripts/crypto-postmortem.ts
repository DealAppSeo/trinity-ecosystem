import * as dotenv from 'dotenv';
import path from 'path';

// Load environment
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { MCLPostmortemHandler } from '../lib/crypto/MCLPostmortemHandler';
import { supabaseAdmin as supabase } from '../lib/supabase';

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const cycleIdArg = args.find(a => a.startsWith('--cycle-id='));
    const cycleId = cycleIdArg ? cycleIdArg.split('=')[1] : null;

    console.log(`🚀 [MCL Postmortem] Starting... ${dryRun ? '(DRY RUN)' : ''}`);

    if (cycleId) {
        console.log(`🎯 Processing specific cycle: ${cycleId}`);
        const result = await MCLPostmortemHandler.processOutcome(cycleId);
        if (result) {
            console.log(`✅ Success: ${result.success ? 'YES' : 'NO'} | Score: ${result.compositeScore}`);
        } else {
            console.error(`❌ Processing failed for cycle ${cycleId}`);
        }
    } else {
        console.log(`🔍 Searching for pending postmortems (prediction_consensus without outcome)...`);

        // Find cycles that are at least 24h old and don't have an outcome yet
        const cutoff = new Date(Date.now() - 86400000).toISOString();

        const { data: pending, error } = await supabase
            .from('prediction_consensus')
            .select('cycle_id, asset')
            .lt('cycle_started_at', cutoff)
            .eq('hitl_decision', 'APPROVED'); // Only approved ones get postmortems usually

        if (error) {
            console.error(`❌ Failed to fetch pending cycles:`, error.message);
            return;
        }

        console.log(`📦 Found ${pending?.length || 0} pending cycles.`);

        for (const cycle of pending || []) {
            // Check if outcome already exists
            const { data: exists } = await supabase
                .from('prediction_outcomes')
                .select('id')
                .eq('cycle_id', cycle.cycle_id)
                .maybeSingle();

            if (exists) continue;

            console.log(`🕒 Processing ${cycle.asset} cycle: ${cycle.cycle_id}`);
            if (!dryRun) {
                await MCLPostmortemHandler.processOutcome(cycle.cycle_id);
            } else {
                console.log(`📝 [Dry Run] Would process ${cycle.cycle_id}`);
            }
        }
    }

    console.log('🏁 Postmortem run complete.');
}

main().catch(console.error);
