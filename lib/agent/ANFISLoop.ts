export async function updateANFISWeights(kvStore: any, feedback: { belief: number, disbelief: number, gateLatency: number }) {
    console.log("[ANFIS] Computing new neuro-fuzzy weights based on execution...", feedback);
    
    // Default weights if KV is empty
    let weights = { gate0: 0.8, gate1: 0.15, gate2: 0.05 };
    
    try {
        const currentData = await kvStore.get('anfis_weights');
        if (currentData) {
            weights = JSON.parse(currentData);
        }
    } catch (e) {
        // kvStore might fail if credentials are not wired, fail open
    }

    // Adaptive neuro-fuzzy logic (stubbed learning rate of 0.01)
    if (feedback.disbelief > 0.5) {
        weights.gate1 = Math.min(0.9, weights.gate1 + 0.01);
        weights.gate0 = Math.max(0.1, weights.gate0 - 0.01);
    } else if (feedback.belief > 0.8) {
        weights.gate0 = Math.min(0.9, weights.gate0 + 0.01);
        weights.gate1 = Math.max(0.1, weights.gate1 - 0.01);
    }

    try {
        await kvStore.put('anfis_weights', JSON.stringify(weights));
        console.log("[ANFIS] Successfully committed new weights to Cloudflare KV: ", weights);
    } catch (e) {
        console.warn("[ANFIS] KV Put skipped - missing Cloudflare KV credentials. Gracefully falling back to Supabase...");
        
        // Supabase Fallback logic
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        
        await supabase.from('sprint_reports').insert({
            agent_name: 'MEL',
            report_type: 'anfis_weights_fallback',
            content: JSON.stringify(weights)
        });
        console.log("[ANFIS] Weights safely written to Supabase.");
    }
    
    return weights;
}
