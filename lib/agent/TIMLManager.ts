import { WaveletTransform } from './WaveletTransform';
import { createClient } from '@supabase/supabase-js';

export interface TIMLAllocation {
    fast_budget: number;  // Cheap models, shallow reasoning
    mid_budget: number;   // Standard models, balanced
    slow_budget: number;  // Powerful models, triadic SBFA, deep verification
}

export class TIMLManager {
    private supabase: any;
    private static AGENT_WINDOW_SIZE = 32;

    constructor() {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        const { createClient } = require('@supabase/supabase-js');
        this.supabase = createClient(url, key);
    }

    /**
     * Executes TIML analysis on recent task telemetry.
     */
    async analyze(agentName: string): Promise<{ alpha: number, allocation: TIMLAllocation }> {
        // Step 1: Fetch signals (Disagreement Energy is our primary entropy proxy)
        const signals = await this.fetchTelemetry(agentName);

        if (signals.length < 4) {
            console.log(`[TIML] ⚠️ Insufficient telemetry for ${agentName}. Defaulting to uniform allocation.`);
            return { alpha: -1.0, allocation: { fast_budget: 0.33, mid_budget: 0.33, slow_budget: 0.34 } };
        }

        // Step 2: Wavelet Decomposition
        const coefficients = WaveletTransform.transform(signals);
        const energySpectrum = WaveletTransform.calculateEnergy(coefficients);
        const alpha = WaveletTransform.estimateAlpha(energySpectrum);

        // Step 3: Compute Allocation Vector
        const allocation = this.computeAllocation(alpha, energySpectrum);

        return { alpha, allocation };
    }

    private async fetchTelemetry(agentName: string): Promise<number[]> {
        // Fetch latest SBFA logs
        const { data, error } = await this.supabase
            .from('trinity_agent_logs')
            .select('metadata')
            .eq('action', 'sbfa_pi_terms')
            .limit(TIMLManager.AGENT_WINDOW_SIZE);

        if (error || !data) {
            console.error(`[TIML] Error fetching telemetry:`, error?.message);
            return [];
        }

        // Extract disagreement energy as signal
        return data.map((log: any) => log.metadata?.pi_terms?.disagreement || 0).reverse();
    }

    private computeAllocation(alpha: number, energySpectrum: number[]): TIMLAllocation {
        const totalDetailEnergy = energySpectrum.slice(1).reduce((a, b) => a + b, 0);

        // Base uniform
        let fast = 0.33;
        let mid = 0.33;
        let slow = 0.34;

        // [SCIENTIFIC CONTROLLER]
        if (totalDetailEnergy < 0.001) {
            // Predictable System (Constant Signal) -> ULTRA FAST
            fast = 0.8; mid = 0.15; slow = 0.05;
        } else if (alpha > -1.0) {
            // High Noise/Complexity/Turbulence -> DEEP VERIFICATION
            fast = 0.1; mid = 0.3; slow = 0.6;
        } else if (alpha < -2.0) {
            // Scalable Stability (Rapid Decay) -> FAST/MID
            fast = 0.6; mid = 0.3; slow = 0.1;
        } else {
            // Golden Bracket (Turbulence observed but decaying) -> BALANCED
            fast = 0.33; mid = 0.33; slow = 0.34;
        }

        return { fast_budget: fast, mid_budget: mid, slow_budget: slow };
    }

    /**
     * Logs TIML decision to Supabase
     */
    async logAnalysis(agentName: string, taskId: number, alpha: number, allocation: TIMLAllocation) {
        const { error } = await this.supabase.from('trinity_agent_logs').insert({
            agent: agentName,
            agent_name: agentName,
            task_id: taskId,
            action: 'timl_analysis',
            message: `TIML Allocated: Fast=${allocation.fast_budget}, Mid=${allocation.mid_budget}, Slow=${allocation.slow_budget}`,
            metadata: {
                alpha,
                allocation,
                timestamp: new Date().toISOString()
            }
        });
        if (error) {
            console.error(`[TIML] ❌ Failed to log analysis:`, error.message);
            throw error;
        }
    }
}
