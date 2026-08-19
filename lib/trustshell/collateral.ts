// lib/trustshell/collateral.ts
//
// How much collateral is REAL?
//
// ZERO IMPORTS. This number feeds `effectiveAuthority`, which bounds how much an
// agent may spend. A number you cannot run standalone is a number nobody checks.
//
// ── THE SHAPE OF THE TABLE, MEASURED BEFORE ANY CODE WAS WRITTEN ────────────
//
// `public.stake_deposits`, 2026-08-19:
//
//   is_simulated  status      asset  rows   sum(amount)      = USDC
//   true          active      USDC     49   4,622,000,000      4,622
//   true          completed   USDC      2   1,050,000,000      1,050
//   false         active      USDC      1      50,000,000         50
//
// **One real deposit. Fifty-one simulated ones.** Summing the table gives 5,722
// USDC against a truth of 50 — a 114x overstatement, and it would land directly
// in the anti-whale term `100 * sqrt(S_usd)`, which is the ceiling on spending.
// sqrt(5722) is 75.6 and sqrt(50) is 7.07, so the inflated figure would hand out
// **more than ten times** the authority that has been collateralised.
//
// ── TWO TRAPS THAT ARE NOT OBVIOUS FROM THE COLUMN NAMES ────────────────────
//
// 1. **A TX HASH DOES NOT MEAN REAL.** All 49 simulated `active` rows carry a
//    `tx_hash`. Filtering on "has a hash" — the intuitive proxy — selects the
//    simulated set almost perfectly and rejects nothing. `is_simulated` is the
//    authority; the hash is decoration.
//
// 2. **`completed` IS NOT CURRENT COLLATERAL.** The two `completed` rows carry
//    no hash and total 1,050 USDC. A completed deposit is a closed one; counting
//    it as backing would let withdrawn money keep buying authority. Only
//    `active` collateralises.
//
// Both are the standing rule in `CLAUDE.md`: suspect the SAMPLE before the
// measurement. Every real-data retraction in this repo came from an assumption
// about the shape of the data made without checking it.
//
// ── UNITS ───────────────────────────────────────────────────────────────────
//
// `amount` is a bigint in the asset's base units. Every row is USDC, which has
// **6 decimals**, so USD = amount / 1e6. The conversion is stated once here and
// the asset is checked rather than assumed — a non-USDC row would otherwise be
// divided by the wrong scale and silently mispriced.

/** One row of `public.stake_deposits`, restated structurally. */
export interface StakeDeposit {
  builder_id: string;
  /** Base units of `asset`. USDC has 6 decimals. */
  amount: number | string;
  asset: string;
  /** THE authority on whether this is real. Not the tx hash. */
  is_simulated: boolean;
  status: string;
  tx_hash?: string | null;
  deposit_tx_hash?: string | null;
}

/** USDC base units per dollar. */
export const USDC_DECIMALS = 6;
export const USDC_SCALE = 10 ** USDC_DECIMALS;

/** The only status that collateralises. A completed deposit is a closed one. */
export const COLLATERALISING_STATUS = 'active';

export type CollateralOutcome = 'MEASURED' | 'NONE' | 'NOT_CHECKED';

export interface RealCollateral {
  /** Dollars of REAL, active collateral. Null when it could not be determined. */
  usd: number | null;
  outcome: CollateralOutcome;
  /** Rows that counted. */
  countedRows: number;
  /** Rows dropped, and why — reported, never silently discarded. */
  excluded: { simulated: number; notActive: number; wrongAsset: number; unparseable: number };
  detail: string;
}

/**
 * Real, active collateral in USD for one builder's deposits.
 *
 * Returns `NOT_CHECKED` with `usd: null` when a row cannot be interpreted —
 * an unknown asset or an unparseable amount. It does NOT fall back to counting
 * the rows it understood: a partial sum presented as a total is how an inflated
 * ceiling gets published, and this number bounds spending.
 *
 * `NONE` (usd 0) and `NOT_CHECKED` (usd null) are different answers. A builder
 * with no real deposits has zero collateral, which is a fact. A builder whose
 * rows could not be read has unknown collateral, which is not.
 */
export function realCollateralUsd(rows: readonly StakeDeposit[]): RealCollateral {
  const excluded = { simulated: 0, notActive: 0, wrongAsset: 0, unparseable: 0 };
  let base = 0;
  let counted = 0;

  for (const r of rows) {
    if (r.is_simulated) {
      excluded.simulated++;
      continue;
    }
    if (r.status !== COLLATERALISING_STATUS) {
      excluded.notActive++;
      continue;
    }
    if (r.asset !== 'USDC') {
      // Unknown scale. Refuse rather than divide by 1e6 and hope.
      excluded.wrongAsset++;
      continue;
    }
    const n = typeof r.amount === 'string' ? Number(r.amount) : r.amount;
    if (!Number.isFinite(n) || n < 0) {
      excluded.unparseable++;
      continue;
    }
    base += n;
    counted++;
  }

  if (excluded.wrongAsset > 0 || excluded.unparseable > 0) {
    return {
      usd: null,
      outcome: 'NOT_CHECKED',
      countedRows: counted,
      excluded,
      detail:
        `${excluded.wrongAsset} row(s) in an asset with no known scale and ` +
        `${excluded.unparseable} unparseable — refusing to report a partial sum as a total, ` +
        'because this number becomes a spending ceiling',
    };
  }

  const usd = base / USDC_SCALE;
  return {
    usd,
    outcome: counted === 0 ? 'NONE' : 'MEASURED',
    countedRows: counted,
    excluded,
    detail:
      counted === 0
        ? `no real active collateral (${excluded.simulated} simulated, ${excluded.notActive} not active)`
        : `${counted} real active deposit(s) totalling ${usd} USDC ` +
          `(excluded ${excluded.simulated} simulated, ${excluded.notActive} not active)`,
  };
}

/**
 * Would counting every row overstate the collateral, and by how much?
 *
 * Exists to keep the 114x visible rather than buried in a comment. If a future
 * change starts summing the table, this ratio is what a gate can point at.
 */
export function overstatementIfUnfiltered(rows: readonly StakeDeposit[]): {
  realUsd: number | null;
  unfilteredUsd: number;
  ratio: number | null;
} {
  const real = realCollateralUsd(rows);
  let all = 0;
  for (const r of rows) {
    const n = typeof r.amount === 'string' ? Number(r.amount) : r.amount;
    if (Number.isFinite(n)) all += n;
  }
  const unfilteredUsd = all / USDC_SCALE;
  return {
    realUsd: real.usd,
    unfilteredUsd,
    ratio: real.usd !== null && real.usd > 0 ? unfilteredUsd / real.usd : null,
  };
}
