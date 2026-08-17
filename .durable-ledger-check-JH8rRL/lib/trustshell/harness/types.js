"use strict";
// lib/trustshell/harness/types.ts — core types for the portable trust harness.
//
// PORTABILITY IS A HARD CONSTRAINT. Nothing in lib/trustshell/harness/ may
// import Supabase, Next, or anything else in this repo. Every external
// dependency arrives through an injected interface: the clock, the trust
// source, the storage. That is what lets this ship as a package other trust
// systems can adopt — the point of RepID being a *portable* reputation layer
// rather than a Trinity feature.
//
// The rule is enforced, not aspirational: scripts/harness-portability-check.mjs
// fails on any import outside this directory.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ManualClock = exports.systemClock = exports.BPS_MAX = void 0;
exports.cosineSimilarity = cosineSimilarity;
exports.BPS_MAX = 10_000;
exports.systemClock = { now: () => Date.now() };
/** A fixed clock for tests and simulations. */
class ManualClock {
    t;
    constructor(t = 0) {
        this.t = t;
    }
    now() {
        return this.t;
    }
    advance(ms) {
        this.t += ms;
    }
    set(t) {
        this.t = t;
    }
}
exports.ManualClock = ManualClock;
/**
 * Cosine similarity, with the degenerate cases pinned.
 *
 * Returns 0 for absent, empty, mismatched-length, or zero-magnitude vectors
 * rather than NaN. A NaN here propagates silently into a ranking and produces
 * an arbitrary winner — the routing equivalent of a green build over undefined
 * references.
 */
function cosineSimilarity(a, b) {
    if (!a || !b || a.length === 0 || a.length !== b.length)
        return 0;
    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < a.length; i += 1) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    if (magA === 0 || magB === 0)
        return 0;
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    const raw = dot / denom;
    // Guard against floating drift pushing this outside [-1, 1].
    return Math.max(-1, Math.min(1, raw));
}
