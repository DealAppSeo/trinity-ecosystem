"""
TrustTrader Historical Backtest
365 days of BTC/USD with Pythagorean Comma BFT veto.
"""

import json
import csv
import os
import time
import requests
import numpy as np
from datetime import datetime, timedelta
from veto_engine import compute_veto, SIGNAL_WEIGHTS

def fetch_btc_365():
    """Fetch 365 days of BTC/USD daily data from CoinGecko."""
    print("[1/4] Fetching 365 days BTC/USD from CoinGecko...")
    resp = requests.get(
        "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart",
        params={"vs_currency": "usd", "days": "365", "interval": "daily"},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    prices = [(p[0], p[1]) for p in data["prices"]]
    volumes = [(v[0], v[1]) for v in data["total_volumes"]]
    print(f"  Got {len(prices)} price points, {len(volumes)} volume points")
    return prices, volumes


def fetch_fng_365():
    """Fetch 365 days of Fear & Greed Index."""
    print("[2/4] Fetching 365 days Fear & Greed...")
    resp = requests.get(
        "https://api.alternative.me/fng/?limit=365",
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()["data"]
    # Convert to {timestamp_ms: value}
    fng = {}
    for entry in data:
        ts = int(entry["timestamp"]) * 1000
        fng[ts] = int(entry["value"])
    print(f"  Got {len(fng)} Fear & Greed data points")
    return fng


def compute_rsi(prices, period=14):
    """Compute RSI from price series."""
    rsi_values = [50.0] * period  # pad beginning
    for i in range(period, len(prices)):
        gains, losses = [], []
        for j in range(i - period, i):
            delta = prices[j + 1] - prices[j] if j + 1 < len(prices) else 0
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
        rsi_values.append(rsi)
    return rsi_values


def normalize(value, min_val, max_val):
    if max_val == min_val:
        return 0.0
    return max(-1.0, min(1.0, 2.0 * (value - min_val) / (max_val - min_val) - 1.0))


def run_backtest():
    prices_raw, volumes_raw = fetch_btc_365()
    fng_data = fetch_fng_365()

    prices = [p[1] for p in prices_raw]
    timestamps = [p[0] for p in prices_raw]
    volumes = [v[1] for v in volumes_raw]

    # Compute RSI
    print("[3/4] Computing RSI and volume metrics...")
    rsi_values = compute_rsi(prices)

    # Align to min length
    n = min(len(prices), len(volumes), len(rsi_values))
    prices = prices[:n]
    timestamps = timestamps[:n]
    volumes = volumes[:n]
    rsi_values = rsi_values[:n]

    # Volume 30d average
    vol_30d_avg = []
    for i in range(n):
        start = max(0, i - 30)
        avg = sum(volumes[start:i + 1]) / (i - start + 1)
        vol_30d_avg.append(avg)

    print(f"[4/4] Running veto engine on {n} days...")

    results = []
    equity = 10000.0
    equity_no_veto = 10000.0
    max_equity = 10000.0
    max_equity_no_veto = 10000.0
    max_drawdown_veto = 0.0
    max_drawdown_no_veto = 0.0

    vetoed_days = 0
    executed_days = 0
    veto_correct = 0  # vetoed and next day was loss
    veto_wrong = 0    # vetoed but next day was gain

    for i in range(1, n - 1):
        date_ts = timestamps[i]
        date_str = datetime.utcfromtimestamp(date_ts / 1000).strftime("%Y-%m-%d")

        # Price momentum (24h change normalized)
        price_change = (prices[i] - prices[i - 1]) / prices[i - 1] * 100
        btc_price_norm = normalize(price_change, -15, 15)

        # RSI normalized
        rsi_norm = normalize(rsi_values[i], 0, 100)

        # Volume spike
        vol_spike = (volumes[i] / vol_30d_avg[i]) - 1.0 if vol_30d_avg[i] > 0 else 0.0
        vol_norm = normalize(vol_spike, -0.5, 2.0)

        # Fear & Greed (find closest day)
        closest_fng = 50
        for fng_ts in sorted(fng_data.keys()):
            if abs(fng_ts - date_ts) < 86400000:  # within 1 day
                closest_fng = fng_data[fng_ts]
                break
        fng_norm = normalize(closest_fng, 0, 100)

        # Build signals dict
        signals = {
            'fear_greed': fng_norm,
            'btc_price': btc_price_norm,
            'btc_rsi': rsi_norm,
            'volume_spike': vol_norm,
            'whale_alert': 0.0,
            'exchange_sentiment': 0.0,
            'interest_rates': 0.0,
            'inflation': 0.0,
            'news_sentiment': 0.0,
            'on_chain_health': 0.0,
            'guru_consensus': 0.0,
            'etf_flow': 0.0,
            'congressional_trading': 0.0,
        }

        # Run veto engine
        veto_result = compute_veto(signals, repid=7000, risk_profile='moderate')

        # Next day return
        next_day_return = (prices[i + 1] - prices[i]) / prices[i]

        # Track equity WITH veto
        if veto_result['execute']:
            equity *= (1 + next_day_return)
            executed_days += 1
        else:
            vetoed_days += 1
            # Check if veto was correct
            if next_day_return < 0:
                veto_correct += 1
            else:
                veto_wrong += 1

        # Track equity WITHOUT veto (always execute)
        equity_no_veto *= (1 + next_day_return)

        # Drawdown tracking
        max_equity = max(max_equity, equity)
        dd = (max_equity - equity) / max_equity
        max_drawdown_veto = max(max_drawdown_veto, dd)

        max_equity_no_veto = max(max_equity_no_veto, equity_no_veto)
        dd_no = (max_equity_no_veto - equity_no_veto) / max_equity_no_veto
        max_drawdown_no_veto = max(max_drawdown_no_veto, dd_no)

        results.append({
            'date': date_str,
            'btc_price': round(prices[i], 2),
            'fear_greed': closest_fng,
            'rsi': round(rsi_values[i], 2),
            'unity_score': veto_result['unity_score'],
            'dissonance': veto_result['dissonance'],
            'veto': veto_result['veto'],
            'execute': veto_result['execute'],
            'next_day_return': round(next_day_return * 100, 4),
            'equity_with_veto': round(equity, 2),
            'equity_no_veto': round(equity_no_veto, 2),
        })

    # Compute statistics
    total_days = len(results)
    veto_rate = vetoed_days / total_days if total_days > 0 else 0

    executed_returns = [r['next_day_return'] for r in results if r['execute']]
    vetoed_returns = [r['next_day_return'] for r in results if not r['execute']]

    avg_return_execute = sum(executed_returns) / len(executed_returns) if executed_returns else 0
    avg_return_veto_days = sum(vetoed_returns) / len(vetoed_returns) if vetoed_returns else 0

    veto_accuracy = veto_correct / (veto_correct + veto_wrong) if (veto_correct + veto_wrong) > 0 else 0

    stats = {
        'total_days': total_days,
        'vetoed_days': vetoed_days,
        'executed_days': executed_days,
        'veto_rate': round(veto_rate * 100, 2),
        'avg_return_on_execute': round(avg_return_execute, 4),
        'avg_return_on_veto_days': round(avg_return_veto_days, 4),
        'equity_start': 10000,
        'equity_end_with_veto': round(equity, 2),
        'equity_end_no_veto': round(equity_no_veto, 2),
        'max_drawdown_with_veto': round(max_drawdown_veto * 100, 2),
        'max_drawdown_without_veto': round(max_drawdown_no_veto * 100, 2),
        'veto_accuracy': round(veto_accuracy * 100, 2),
        'veto_correct': veto_correct,
        'veto_wrong': veto_wrong,
        'total_return_with_veto': round((equity / 10000 - 1) * 100, 2),
        'total_return_no_veto': round((equity_no_veto / 10000 - 1) * 100, 2),
    }

    # Print results
    print("\n" + "=" * 60)
    print("TRUSTTRADER BACKTEST RESULTS — 365 Days BTC/USD")
    print("=" * 60)
    for k, v in stats.items():
        label = k.replace('_', ' ').title()
        if 'return' in k or 'rate' in k or 'drawdown' in k or 'accuracy' in k:
            print(f"  {label:40s} {v}%")
        elif 'equity' in k:
            print(f"  {label:40s} ${v:,.2f}")
        else:
            print(f"  {label:40s} {v}")
    print("=" * 60)

    # Save CSV
    csv_path = "/tmp/backtest_results.csv"
    with open(csv_path, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=results[0].keys())
        writer.writeheader()
        writer.writerows(results)
    print(f"\nCSV saved to {csv_path}")

    return stats, results


if __name__ == "__main__":
    stats, results = run_backtest()
    print(f"\nBacktest complete. {stats['total_days']} days analyzed.")
    print(json.dumps(stats, indent=2))
