"""
TrustTrader Signal Fetcher
Fetches 13 market signals mapped to Circle of Fifths.
Writes all signals to trusttrader_signals table.
"""

import os
import json
import time
import math
import requests
from datetime import datetime, timedelta
from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://qnnpjhlxljtqyigedwkb.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", os.environ.get("SUPABASE_KEY", ""))

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

PRISM_API_KEY = os.environ.get("PRISM_API_KEY", "")
PRISM_BASE_URL = "https://api.prismapi.ai"

STUB_SIGNALS = {
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


def normalize(value, min_val, max_val):
    """Normalize a value to [-1.0, +1.0]."""
    if max_val == min_val:
        return 0.0
    normalized = 2.0 * (value - min_val) / (max_val - min_val) - 1.0
    return max(-1.0, min(1.0, normalized))


def fetch_fear_greed():
    """Fetch Fear & Greed Index from alternative.me (0-100 scale)."""
    try:
        resp = requests.get("https://api.alternative.me/fng/?limit=1", timeout=10)
        resp.raise_for_status()
        data = resp.json()
        value = int(data["data"][0]["value"])
        return value, normalize(value, 0, 100), "alternative.me"
    except Exception as e:
        print(f"[WARN] Fear & Greed fetch failed: {e}")
        return 50, 0.0, "stub"


def fetch_prism_btc():
    """Fetch BTC price from PRISM API (preferred source)."""
    if not PRISM_API_KEY:
        return None
    try:
        resp = requests.get(
            f"{PRISM_BASE_URL}/resolve/BTC",
            headers={"X-API-Key": PRISM_API_KEY},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        price = float(data.get("price", data.get("value", 0)))
        confidence = float(data.get("confidence", 0.5))
        # Use confidence as a signal quality indicator
        return price, confidence, data
    except Exception as e:
        print(f"[WARN] PRISM BTC fetch failed: {e}")
        return None


def fetch_btc_price():
    """Fetch BTC/USD price — PRISM first, CoinGecko fallback."""
    # Try PRISM first
    prism_result = fetch_prism_btc()
    if prism_result:
        price, confidence, raw_data = prism_result
        # Use 24h change if available, else derive from confidence
        change_proxy = (confidence - 0.5) * 30  # map confidence to change-like value
        normalized = normalize(change_proxy, -15, 15)
        return price, normalized, "prism"

    # Fallback to CoinGecko
    try:
        resp = requests.get(
            "https://api.coingecko.com/api/v3/simple/price",
            params={"ids": "bitcoin", "vs_currencies": "usd", "include_24hr_change": "true"},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()["bitcoin"]
        price = data["usd"]
        change_24h = data.get("usd_24h_change", 0.0)
        normalized = normalize(change_24h, -15, 15)
        return price, normalized, "coingecko"
    except Exception as e:
        print(f"[WARN] BTC price fetch failed: {e}")
        return 0, 0.0, "stub"


def fetch_btc_rsi():
    """Calculate RSI proxy from CoinGecko 14-day price history."""
    try:
        resp = requests.get(
            "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart",
            params={"vs_currency": "usd", "days": "14", "interval": "daily"},
            timeout=15,
        )
        resp.raise_for_status()
        prices = [p[1] for p in resp.json()["prices"]]
        if len(prices) < 2:
            return 50, 0.0, "stub"

        gains, losses = [], []
        for i in range(1, len(prices)):
            delta = prices[i] - prices[i - 1]
            if delta > 0:
                gains.append(delta)
                losses.append(0)
            else:
                gains.append(0)
                losses.append(abs(delta))

        avg_gain = sum(gains) / len(gains) if gains else 0
        avg_loss = sum(losses) / len(losses) if losses else 0.0001

        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))
        normalized = normalize(rsi, 0, 100)
        return round(rsi, 2), normalized, "coingecko_calc"
    except Exception as e:
        print(f"[WARN] RSI calc failed: {e}")
        return 50, 0.0, "stub"


def fetch_volume_spike():
    """Compare current volume to 30d average from CoinGecko."""
    try:
        resp = requests.get(
            "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart",
            params={"vs_currency": "usd", "days": "30", "interval": "daily"},
            timeout=15,
        )
        resp.raise_for_status()
        volumes = [v[1] for v in resp.json()["total_volumes"]]
        if len(volumes) < 2:
            return 0, 0.0, "stub"

        avg_vol = sum(volumes[:-1]) / len(volumes[:-1])
        current_vol = volumes[-1]
        spike_ratio = (current_vol / avg_vol) - 1.0 if avg_vol > 0 else 0.0
        normalized = normalize(spike_ratio, -0.5, 2.0)
        return round(spike_ratio, 4), normalized, "coingecko_calc"
    except Exception as e:
        print(f"[WARN] Volume spike calc failed: {e}")
        return 0, 0.0, "stub"


def fetch_all_signals():
    """Fetch all 13 signals, return dict of {name: (raw, normalized, source)}."""
    signals = {}

    fear_raw, fear_norm, fear_src = fetch_fear_greed()
    signals['fear_greed'] = (fear_raw, round(fear_norm, 4), fear_src)

    btc_raw, btc_norm, btc_src = fetch_btc_price()
    signals['btc_price'] = (btc_raw, round(btc_norm, 4), btc_src)

    rsi_raw, rsi_norm, rsi_src = fetch_btc_rsi()
    signals['btc_rsi'] = (rsi_raw, round(rsi_norm, 4), rsi_src)

    vol_raw, vol_norm, vol_src = fetch_volume_spike()
    signals['volume_spike'] = (vol_raw, round(vol_norm, 4), vol_src)

    for name, stub_val in STUB_SIGNALS.items():
        signals[name] = (stub_val, stub_val, "stub")

    return signals


def write_signals_to_db(signals):
    """Write all 13 signals to trusttrader_signals table."""
    if not SUPABASE_KEY:
        print("[ERROR] No SUPABASE_KEY set")
        return False

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    now = datetime.utcnow().isoformat()

    rows = []
    for name, (raw, normalized, source) in signals.items():
        rows.append({
            "signal_name": name,
            "value": float(raw),
            "normalized": float(normalized),
            "weight": SIGNAL_WEIGHTS.get(name, 1.0),
            "source": source,
            "fetched_at": now,
        })

    result = supabase.table("trusttrader_signals").insert(rows).execute()
    print(f"[OK] Wrote {len(rows)} signals to trusttrader_signals at {now}")
    return True


def get_latest_signals_dict():
    """Get the most recent set of signals as {name: normalized_value} dict."""
    if not SUPABASE_KEY:
        return {name: 0.0 for name in SIGNAL_WEIGHTS}

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    result = supabase.table("trusttrader_signals") \
        .select("signal_name, normalized") \
        .order("fetched_at", desc=True) \
        .limit(13) \
        .execute()

    signals = {}
    for row in result.data:
        if row["signal_name"] not in signals:
            signals[row["signal_name"]] = float(row["normalized"])
    return signals


def run_once():
    """Fetch all signals and write to DB. Returns signals dict."""
    print("=== TrustTrader Signal Fetcher ===")
    signals = fetch_all_signals()
    for name, (raw, normalized, source) in signals.items():
        print(f"  {name:25s} raw={raw:>10}  norm={normalized:>7.4f}  src={source}")
    write_signals_to_db(signals)
    return signals


if __name__ == "__main__":
    import time as _time
    from datetime import datetime as _dt
    import sys

    if "--once" in sys.argv:
        run_once()
    else:
        print("Signal fetcher starting — every 5 min")
        while True:
            try:
                run_once()
                print(f"[LOOP] Fetched at {_dt.utcnow().isoformat()}Z")
            except Exception as e:
                print(f"[ERROR] {e}")
            _time.sleep(300)
