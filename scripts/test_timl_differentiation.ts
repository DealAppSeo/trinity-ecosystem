import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { TIMLManager } from '../lib/agent/TIMLManager';
import { WaveletTransform } from '../lib/agent/WaveletTransform';

async function testDifferentiation() {
    console.log("=== TIML DIFFERENTIATION TEST ===");
    const timl = new (TIMLManager as any)(); // Cast to access private methods

    // 1. "Simple/Predictable" Signal (Low constant disagreement)
    // Signal: [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01]
    const simpleSignal = Array(8).fill(0.01);

    // 2. "Complex/Turbulent" Signal (High variance/random disagreement)
    // Signal: [0.1, 0.8, 0.2, 0.9, 0.1, 0.7, 0.3, 0.8]
    const complexSignal = [0.1, 0.8, 0.2, 0.9, 0.1, 0.7, 0.3, 0.8];

    console.log("\n--- SCENARIO 1: SIMPLE/PREDICTABLE ---");
    const simpleCoeffs = WaveletTransform.transform(simpleSignal);
    const simpleEnergy = WaveletTransform.calculateEnergy(simpleCoeffs);
    const simpleAlpha = WaveletTransform.estimateAlpha(simpleEnergy);
    const simpleAlloc = timl.computeAllocation(simpleAlpha, simpleEnergy);
    console.log(`Alpha: ${simpleAlpha.toFixed(4)}`);
    console.log(`Allocation: [FAST: ${simpleAlloc.fast_budget}, MID: ${simpleAlloc.mid_budget}, SLOW: ${simpleAlloc.slow_budget}]`);

    console.log("\n--- SCENARIO 2: COMPLEX/TURBULENT ---");
    const complexCoeffs = WaveletTransform.transform(complexSignal);
    const complexEnergy = WaveletTransform.calculateEnergy(complexCoeffs);
    const complexAlpha = WaveletTransform.estimateAlpha(complexEnergy);
    const complexAlloc = timl.computeAllocation(complexAlpha, complexEnergy);
    console.log(`Alpha: ${complexAlpha.toFixed(4)}`);
    console.log(`Allocation: [FAST: ${complexAlloc.fast_budget}, MID: ${complexAlloc.mid_budget}, SLOW: ${complexAlloc.slow_budget}]`);
}

testDifferentiation().then(() => process.exit(0));
