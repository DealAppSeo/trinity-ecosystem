"""
TrustTrader Veto Engine
Pythagorean Comma BFT veto with Circle of Fifths dissonance.
Unity Score = (Logic x Chaos x Beauty)^(1/phi)
"""

import numpy as np

PHI = (1 + np.sqrt(5)) / 2  # 1.618033988749895
COMMA_GAP = (3/2)**12 / 2**7 - 1  # 0.013643264...
BASE_THETA = 0.0195

RISK_PROFILES = {
    'very_conservative': BASE_THETA / PHI,
    'conservative':      BASE_THETA * 0.8,
    'moderate':          BASE_THETA,
    'aggressive':        BASE_THETA * PHI,
    'very_aggressive':   BASE_THETA * PHI**2,
}

REPID_THRESHOLDS = {
    'very_conservative': 8500,
    'conservative':      7500,
    'moderate':          6500,
    'aggressive':        5000,
    'very_aggressive':   3000,
}

SIGNAL_WEIGHTS = {
    'fear_greed': 1.5,
    'on_chain_health': 1.2,
    'whale_alert': 1.2,
    'btc_price': 1.0,
    'btc_rsi': 1.0,
    'volume_spike': 1.0,
    'exchange_sentiment': 0.9,
    'news_sentiment': 0.9,
    'interest_rates': 0.8,
    'inflation': 0.8,
    'guru_consensus': 0.7,
    'etf_flow': 0.7,
    'congressional_trading': 0.6,
}


def compute_veto(signals_dict, repid, risk_profile='moderate'):
    """
    Compute veto decision using Circle of Fifths dissonance mapping.

    Args:
        signals_dict: dict of {signal_name: normalized_value} where values in [-1, 1]
        repid: agent reputation score (0-10000)
        risk_profile: one of RISK_PROFILES keys

    Returns:
        dict with veto, execute, unity_score, dissonance, threshold, reason
    """
    signals = np.array(list(signals_dict.values()))
    weights = np.array([
        SIGNAL_WEIGHTS.get(k, 1.0)
        for k in signals_dict.keys()
    ])

    # Map signals to chromatic note indices (Circle of Fifths)
    note_indices = np.round(7 * (signals + 1)) % 12

    # Compute harmonic resultant vector (weighted phasor sum)
    h = np.sum(
        weights * np.exp(1j * 2 * np.pi * note_indices / 12)
    )

    # Dissonance = magnitude loss + phase offset scaled by Pythagorean Comma
    mag_loss = np.abs(np.abs(h) / 13 - 1)
    phase_offset = np.abs(
        np.angle(h) % (np.pi / 6) - np.pi / 6
    )
    dissonance = mag_loss + phase_offset * COMMA_GAP

    # Risk-adjusted threshold
    theta = RISK_PROFILES[risk_profile]
    repid_threshold = REPID_THRESHOLDS[risk_profile]

    # Unity Score components
    logic = min(repid / 10000, 1.0)
    chaos = max(0.0, 1.0 - dissonance)
    beauty = max(0.0, 1.0 - dissonance)
    unity = (logic * chaos * beauty) ** (1 / PHI)

    # Veto decision
    veto = (
        dissonance > theta and
        repid < repid_threshold
    )
    execute = unity > 0.95 and not veto

    return {
        'veto': veto,
        'execute': execute,
        'unity_score': round(float(unity), 4),
        'dissonance': round(float(dissonance), 6),
        'threshold': round(theta, 6),
        'repid_threshold': repid_threshold,
        'logic': round(float(logic), 4),
        'chaos': round(float(chaos), 4),
        'beauty': round(float(beauty), 4),
        'reason': (
            f'Dissonance {dissonance:.4f} > {theta:.4f}'
            if veto else None
        ),
    }


if __name__ == "__main__":
    print("=== TrustTrader Veto Engine Test ===\n")

    # Test with sample signals
    sample_signals = {
        'fear_greed': 0.4,
        'btc_price': 0.2,
        'btc_rsi': 0.1,
        'volume_spike': -0.1,
        'whale_alert': 0.0,
        'exchange_sentiment': 0.0,
        'interest_rates': -0.2,
        'inflation': -0.15,
        'news_sentiment': 0.0,
        'on_chain_health': 0.3,
        'guru_consensus': 0.2,
        'etf_flow': 0.1,
        'congressional_trading': -0.3,
    }

    for profile in RISK_PROFILES:
        result = compute_veto(sample_signals, repid=7000, risk_profile=profile)
        print(f"Profile: {profile:20s} | Unity: {result['unity_score']:.4f} | "
              f"Dissonance: {result['dissonance']:.6f} | Theta: {result['threshold']:.6f} | "
              f"Veto: {result['veto']} | Execute: {result['execute']}")

    print(f"\n--- Edge cases ---")
    # High RepID agent
    result = compute_veto(sample_signals, repid=9500, risk_profile='moderate')
    print(f"High RepID (9500):  Unity={result['unity_score']:.4f} Veto={result['veto']} Execute={result['execute']}")

    # Low RepID agent
    result = compute_veto(sample_signals, repid=2000, risk_profile='moderate')
    print(f"Low RepID (2000):   Unity={result['unity_score']:.4f} Veto={result['veto']} Execute={result['execute']}")

    # All bearish signals
    bearish = {k: -0.8 for k in SIGNAL_WEIGHTS}
    result = compute_veto(bearish, repid=7000, risk_profile='moderate')
    print(f"All bearish:        Unity={result['unity_score']:.4f} Dissonance={result['dissonance']:.6f} Veto={result['veto']}")

    # All bullish signals
    bullish = {k: 0.8 for k in SIGNAL_WEIGHTS}
    result = compute_veto(bullish, repid=7000, risk_profile='moderate')
    print(f"All bullish:        Unity={result['unity_score']:.4f} Dissonance={result['dissonance']:.6f} Veto={result['veto']}")

    print(f"\nComma gap: {COMMA_GAP:.12f}")
    print(f"PHI: {PHI:.15f}")
