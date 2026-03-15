pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";

// Joint Proof: Proves an agent's score + 3 history hashes + aggregates swarm
template JointRepIDProof(n) {
    // Agent-Specific (Base)
    signal input private_score;
    signal input private_history[3];
    signal input public_threshold;
    signal input public_hash;

    // Swarm-Specific (Recursive/Aggregate)
    signal input base_valids[n];
    signal input public_min_valid;

    // 1. Base Score Check
    component geq_base = GreaterEqThan(32);
    geq_base.in[0] <== private_score;
    geq_base.in[1] <== public_threshold;
    geq_base.out === 1;

    // 2. Base History Provenance (Poseidon)
    component poseidon = Poseidon(3);
    for (var i = 0; i < 3; i++) {
        poseidon.inputs[i] <== private_history[i];
    }
    poseidon.out === public_hash;

    // 3. Swarm Aggregation (BFT-style)
    signal sum;
    var temp_sum = 0;
    for (var i = 0; i < n; i++) {
        temp_sum += base_valids[i];
    }
    sum <== temp_sum;

    component geq_swarm = GreaterEqThan(32);
    geq_swarm.in[0] <== sum;
    geq_swarm.in[1] <== public_min_valid;
    geq_swarm.out === 1;

    signal output valid <== 1;
}

component main {public [public_threshold, public_hash, public_min_valid]} = JointRepIDProof(3);
