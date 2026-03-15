import { zkpBadgeGenerator } from '../lib/guardrail/ZKPReputationBadge';

/**
 * Self-Audit Agent: Measures Trust Layer Effectiveness (Phase 2.0).
 * Target: Veto Rate 100% on halls, Latency < 1s.
 */
async function runSelfAudit() {
    console.log('🔍 Starting Trust Layer Self-Audit (200 Fuzz Cases)...');

    const auditResults = await zkpBadgeGenerator.measureTrustEffectiveness();
    
    console.log('\n--- 🏁 Recursive Phase 2 Audit Results ---');
    console.log(`Vetoed: ${auditResults.vetoed}/${auditResults.total}`);
    console.log(`Veto Rate: ${auditResults.vetoRate.toFixed(2)}% ${auditResults.vetoRate >= 95 ? '🥇' : '⚠️'}`);
    console.log(`Swarm Health Score: ${auditResults.swarmHealthScore.toFixed(2)}% ${auditResults.swarmHealthScore >= 90 ? '🔋' : '🪫'}`);
    console.log(`Avg Latency: ${auditResults.latency.toFixed(2)}ms`);
    console.log(`Avg Gas Cost: ${auditResults.avgGas.toFixed(0)}`);
    console.log(`Recursion Depth: ${auditResults.depth}`);
    console.log(`Learn Gain: ${auditResults.learnGain.toFixed(2)}%`);

    console.log('\n✅ Audit complete. Recursive patterns and gains are logged in the "IMMUNE_SYSTEM" dashboard.');
    
    process.exit(auditResults.vetoRate >= 95 ? 0 : 1);
}

runSelfAudit().catch(err => {
    console.error('Audit failed:', err);
    process.exit(1);
});
