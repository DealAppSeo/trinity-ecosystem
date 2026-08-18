// lib/trustshell/floor-decay-consult.ts
//
// Production caller for decideFloor. The decay module stays pure and writes
// nothing; this is the consult. last-demonstration is usually unknown, so the
// honest result is not_checked — that is a wired consult, not a silent hold
// and not an invented rate.
//
// staleAfterMs still has no default. Missing env → not_checked, naming the var.

import {
  decideFloor,
  dbTierFloorFor,
  type FloorDecision,
} from './repid-floor-decay';

export function floorConfigFromEnv(
  env: Record<string, string | undefined>
): { staleAfterMs: number; maxStepsPerEvaluation: number } | { missing: string } {
  const raw = env.TRUSTSHELL_FLOOR_STALE_AFTER_MS;
  const ms = Number(raw);
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return {
      missing:
        'TRUSTSHELL_FLOOR_STALE_AFTER_MS is unset — refusing to invent a decay rate',
    };
  }
  if (!Number.isFinite(ms) || ms <= 0) {
    return {
      missing: `TRUSTSHELL_FLOOR_STALE_AFTER_MS must be a positive number; got ${JSON.stringify(raw)}`,
    };
  }
  return { staleAfterMs: ms, maxStepsPerEvaluation: 1 };
}

export function consultFloor(input: {
  peakRepid: number | null;
  currentRepid: number | null;
  floorOverride: number | null;
  isHuman: boolean | null;
  lastReEarnedAt: number | null;
  now: number;
  env: Record<string, string | undefined>;
}): FloorDecision {
  const cfg = floorConfigFromEnv(input.env);
  if ('missing' in cfg) {
    return { kind: 'not_checked', floor: input.floorOverride ?? 0, reason: cfg.missing };
  }
  if (input.isHuman === null) {
    return {
      kind: 'not_checked',
      floor: input.floorOverride ?? 0,
      reason: 'is_human is unknown — refusing to decay a person by omission',
    };
  }
  const peak = input.peakRepid ?? 0;
  const current = input.currentRepid ?? 0;
  const floor = input.floorOverride ?? dbTierFloorFor(peak);
  return decideFloor(
    {
      peakRepid: peak,
      currentRepid: current,
      floor,
      lastReEarnedAt: input.lastReEarnedAt,
      isHuman: input.isHuman,
    },
    input.now,
    cfg
  );
}
