
pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/comparators.circom";

// Phase 4.8: ZKP Reputation Threshold Circuit
// Proves an agent's RepID is >= a required threshold without revealing the score.
// Both repID and threshold should be scaled by 1000 (e.g., 61.8 -> 61800).

template RepIDThreshold() {
    signal input repID;       // Private: Agent's actual reputation score
    signal input threshold;   // Public: Minimum required threshold
    signal output out;        // Public: 1 if repID >= threshold, 0 otherwise

    // GreaterThan(32) returns 1 if in[0] > in[1]
    // To prove repID >= threshold, we check if repID > threshold - 1
    component gt = GreaterThan(32);
    gt.in[0] <== repID;
    gt.in[1] <== threshold - 1;

    out <== gt.out;
}

component main {public [threshold]} = RepIDThreshold();
