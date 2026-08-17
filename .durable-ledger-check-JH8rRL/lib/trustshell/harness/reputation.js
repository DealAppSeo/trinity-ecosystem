"use strict";
// lib/trustshell/harness/reputation.ts — earned reputation with confidence.
//
// WHY THIS EXISTS. The first E2E simulation run (seed 20260813, 2000 tasks)
// scored Kendall tau 0.429 between learned rank and ground truth — barely
// better than arbitrary. The cause was not the update rule but what was
// missing around it: a raw EWMA says nothing about how much evidence backs it,
// so an expert at 8108 on 118 observations outranked one at 6753 on 757. The
// harness was treating a lucky streak and a long track record as the same
// claim.
//
// That is the same defect this codebase keeps finding, wearing different
// clothes: a number reported with more confidence than it was earned. A
// reputation layer that does it is worse than none, because everything
// downstream — routing, quorum weight, tier, payout — inherits the overclaim.
//
// THE FIX: separate the observation from the confidence in it, and expose
// three numbers instead of one.
//
//   observedScore — what the outcomes say, unadjusted.
//   confidence    — how much evidence stands behind that, 0..1.
//   earnedScore   — observedScore shrunk toward the prior by confidence.
//
// Shrinkage is standard empirical Bayes: weight = n / (n + k), where k is the
// observation count at which the observation and the prior carry equal weight.
// New experts sit near the prior and move as they earn it, which is exactly
// the behaviour a trust layer should have, and it is the same principle as the
// cold-start rule in router.ts — no evidence is not evidence of badness.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReputationLedger = void 0;
const types_1 = require("@/lib/trustshell/harness/types");
const DEFAULTS = {
    prior: 5000,
    alpha: 0.06,
    confidenceK: 20,
    coldStartConfidence: 0.5,
};
/**
 * Earned-reputation ledger.
 *
 * Deliberately holds only outcomes. No self-reported field can be written
 * here — a caller wanting to carry a claimed score keeps it beside this, and
 * the router will ignore it.
 */
class ReputationLedger {
    observed = new Map();
    counts = new Map();
    cfg;
    constructor(config = {}) {
        this.cfg = { ...DEFAULTS, ...config };
        if (this.cfg.alpha <= 0 || this.cfg.alpha > 1)
            throw new Error('alpha must be in (0, 1]');
        if (this.cfg.confidenceK <= 0)
            throw new Error('confidenceK must be > 0');
    }
    /** Record one outcome. `good` is ground truth from a receipt, not a guess. */
    record(id, good) {
        const prev = this.observed.get(id) ?? this.cfg.prior;
        const target = good ? types_1.BPS_MAX : 0;
        this.observed.set(id, prev + this.cfg.alpha * (target - prev));
        this.counts.set(id, (this.counts.get(id) ?? 0) + 1);
    }
    /**
     * Record a graded outcome in 0..1.
     *
     * Used where the signal is a rubric score rather than pass/fail. Values
     * outside the range throw rather than clamping: a caller producing 1.5 has a
     * bug, and silently accepting it would launder that into the ledger.
     */
    recordGraded(id, quality) {
        if (!Number.isFinite(quality) || quality < 0 || quality > 1) {
            throw new Error(`quality must be a finite number in [0, 1]; got ${quality}`);
        }
        const prev = this.observed.get(id) ?? this.cfg.prior;
        const target = quality * types_1.BPS_MAX;
        this.observed.set(id, prev + this.cfg.alpha * (target - prev));
        this.counts.set(id, (this.counts.get(id) ?? 0) + 1);
    }
    observations(id) {
        return this.counts.get(id) ?? 0;
    }
    confidence(id) {
        const n = this.observations(id);
        return n / (n + this.cfg.confidenceK);
    }
    /** The number to rank on. Shrunk toward the prior by evidence weight. */
    earnedScore(id) {
        const observed = this.observed.get(id) ?? this.cfg.prior;
        const c = this.confidence(id);
        return Math.round(c * observed + (1 - c) * this.cfg.prior);
    }
    isColdStart(id) {
        return this.confidence(id) < this.cfg.coldStartConfidence;
    }
    /**
     * Optimistic ranking value: earned score plus a bonus for what we do not know.
     *
     * Standard upper-confidence-bound reasoning. An expert we have barely
     * observed might be excellent, and the cost of finding out is one call. The
     * bonus decays as confidence rises, so it disappears once the evidence can
     * speak for itself.
     */
    upperConfidenceBound(id, optimismBps = 2500) {
        const earned = this.earnedScore(id);
        const bonus = (1 - this.confidence(id)) * optimismBps;
        return Math.min(types_1.BPS_MAX, Math.round(earned + bonus));
    }
    view(id) {
        const n = this.observations(id);
        const c = this.confidence(id);
        const observed = Math.round(this.observed.get(id) ?? this.cfg.prior);
        const earned = this.earnedScore(id);
        let basis;
        if (n === 0) {
            basis = `No observations. Score is the ${this.cfg.prior} prior and asserts nothing about this expert.`;
        }
        else if (c < 0.5) {
            basis =
                `${n} observation(s), confidence ${c.toFixed(2)}. Observed ${observed} is shrunk toward the ` +
                    `${this.cfg.prior} prior, giving ${earned}. Treat as provisional — this is not yet a track record.`;
        }
        else {
            basis = `${n} observations, confidence ${c.toFixed(2)}. Observed ${observed}, earned ${earned}.`;
        }
        return {
            id,
            observedScore: observed,
            confidence: c,
            earnedScore: earned,
            observations: n,
            coldStart: this.isColdStart(id),
            basis,
        };
    }
    ids() {
        return [...this.counts.keys()];
    }
    /**
     * Complete state for one expert, sufficient to reconstruct it exactly.
     *
     * BOTH FIELDS ARE LOAD-BEARING. `observedScore` alone is not a ledger: the
     * whole design rests on `confidence = n / (n + k)`, so an expert restored
     * without its observation count has confidence 0, and `earnedScore` collapses
     * to the prior no matter what it had earned. Persisting the score and
     * dropping the count would silently erase every track record in the fleet
     * while looking like a successful save.
     */
    snapshot() {
        return this.ids().map((id) => ({
            id,
            // The raw EWMA, unrounded. `view()` rounds for display; rounding here
            // would make save/load lossy in a way that compounds over restarts.
            observedScore: this.observed.get(id) ?? this.cfg.prior,
            observations: this.counts.get(id) ?? 0,
        }));
    }
    /**
     * Replace all state with `records`. Existing entries are discarded.
     *
     * Replace rather than merge, because merging two ledgers is not defined —
     * you cannot add observation counts from two sources without knowing whether
     * they observed the same events.
     */
    hydrate(records) {
        this.observed.clear();
        this.counts.clear();
        for (const r of records) {
            if (!Number.isFinite(r.observedScore)) {
                throw new Error(`observedScore for '${r.id}' must be finite; got ${r.observedScore}`);
            }
            if (!Number.isInteger(r.observations) || r.observations < 0) {
                throw new Error(`observations for '${r.id}' must be a non-negative integer; got ${r.observations}`);
            }
            this.observed.set(r.id, r.observedScore);
            this.counts.set(r.id, r.observations);
        }
    }
}
exports.ReputationLedger = ReputationLedger;
