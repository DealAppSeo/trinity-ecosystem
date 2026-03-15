pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";

// Base Template with Hallucination Injection
template RepIDBaseProof() {
    signal input private_score;
    signal input private_history[3];
    signal input injected_error;        // Private: Agent-injected for halluc testing
    signal input public_threshold;
    signal input public_hash;

    // Halluc Catch Logic
    signal error_adjusted_score <== private_score - injected_error;

    component geq = GreaterEqThan(32);
    geq.in[0] <== error_adjusted_score;
    geq.in[1] <== public_threshold;
    geq.out === 1;

    component poseidon = Poseidon(3);
    for (var i = 0; i < 3; i++) {
        poseidon.inputs[i] <== private_history[i];
    }
    poseidon.out === public_hash;

    signal output base_valid <== 1;
}

// Adaptive Recursive Aggregator
template RepIDAdaptiveRecursive(n) {
    signal input base_valids[n];
    signal input adaptive_depth;        // Depth weighting
    signal input public_min_valid;

    signal sum;
    var temp_sum = 0;
    for (var i = 0; i < n; i++) {
        temp_sum += base_valids[i];
    }
    sum <== temp_sum;

    // Weighting logic (Simplified for Circom arithmetics)
    // In production, this would use more complex gate logic
    component geq = GreaterEqThan(32);
    geq.in[0] <== sum;
    geq.in[1] <== public_min_valid;
    geq.out === 1;

    signal output valid <== geq.out;
}

// Swarm Hallucination Test Component
template RepIDHallucTest(n) {
    signal input base_valids[n];
    signal input injected_errors[n];
    signal input public_error_threshold;
    signal input public_min_valid;

    signal error_sum;
    var temp_err_sum = 0;
    for (var i = 0; i < n; i++) {
        temp_err_sum += injected_errors[i];
    }
    error_sum <== temp_err_sum;

    // Veto if total errors exceed threshold
    component lt = LessThan(32);
    lt.in[0] <== error_sum;
    lt.in[1] <== public_error_threshold;
    
    component aggregator = RepIDAdaptiveRecursive(n);
    for (var i = 0; i < n; i++) {
        aggregator.base_valids[i] <== base_valids[i];
    }
    aggregator.adaptive_depth <== 1;
    aggregator.public_min_valid <== public_min_valid;

    signal output test_valid <== lt.out * aggregator.valid;
}

component main {public [public_error_threshold, public_min_valid]} = RepIDHallucTest(3);
