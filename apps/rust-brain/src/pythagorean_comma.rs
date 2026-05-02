// Threat-direction semantics per P-003 provisional filing:
// Threat = gap ratio approaching PYTHAGOREAN_COMMA_RATIO (1.0136).
// Large divergence is NOT the threat. See lib/trust/BFTEngine.ts
// for the canonical TS implementation. Do not invert this without
// re-reading P-003.

/// The Pythagorean comma represents the divergence between 12 just perfect fifths
/// and 7 octaves. We use this precise mathematical ratio as a veto threshold
/// to detect coordinated LLM manipulation based on weight divergence.
pub const PYTHAGOREAN_COMMA_NUMERATOR: f64 = 531441.0;
pub const PYTHAGOREAN_COMMA_DENOMINATOR: f64 = 524288.0;

pub const PYTHAGOREAN_COMMA_RATIO: f64 = PYTHAGOREAN_COMMA_NUMERATOR / PYTHAGOREAN_COMMA_DENOMINATOR; // ~1.0136

pub fn check_veto_threshold(divergence: f64) -> bool {
    // Small divergence (below the Pythagorean Comma ratio) signals coordinated bias — trigger veto.
    divergence < PYTHAGOREAN_COMMA_RATIO
}
