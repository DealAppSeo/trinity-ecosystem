import { supabaseAdmin as supabase } from '../supabase';
import { ASSET_CG_MAP } from '../constants';

export interface PostmortemResult {
    cycleId: string;
    asset: string;
    success: boolean;
    compositeScore: number;
    details: any;
}

export class MCLPostmortemHandler {
    /**
     * Fetches historical price for an asset at a specific timestamp from CoinGecko.
     */
    private static async getHistoricalPrice(asset: string, timestamp: string): Promise<number | null> {
        const coinId = ASSET_CG_MAP[asset.toUpperCase()];
        if (!coinId) {
            console.error(`❌ [Postmortem] Unsupported asset: ${asset}`);
            return null;
        }

        try {
            const date = new Date(timestamp);
            const ts = Math.floor(date.getTime() / 1000);

            // Note: v3/coins/{id}/market_chart doesn't take a specific point-in-time easily, 
            // but we can query days=1 and find the closest hourly candle.
            const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=1&interval=hourly`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`CoinGecko HTTP ${response.status}`);

            const data = await response.json();
            const prices: [number, number][] = data.prices; // [timestamp_ms, price]

            // Find price closest to target timestamp
            const targetMs = date.getTime();
            let closest = prices[0];
            let minDiff = Math.abs(closest[0] - targetMs);

            for (const p of prices) {
                const diff = Math.abs(p[0] - targetMs);
                if (diff < minDiff) {
                    minDiff = diff;
                    closest = p;
                }
            }

            return closest[1];
        } catch (e: any) {
            console.error(`❌ [Postmortem] CoinGecko Fetch Failed for ${asset}:`, e.message);
            return null;
        }
    }

    /**
     * Processes the postmortem for a single prediction cycle.
     * Wrapped in an atomic transaction via Supabase RPC 'process_prediction_postmortem'.
     */
    static async processOutcome(cycleId: string): Promise<PostmortemResult | null> {
        console.log(`🔍 [Postmortem] Processing Cycle: ${cycleId}...`);

        try {
            // 1. Fetch Cycle Data
            const { data: cycle, error: cycleErr } = await supabase
                .from('prediction_consensus')
                .select('*, prediction_signals(*)')
                .eq('cycle_id', cycleId)
                .single();

            if (cycleErr || !cycle) throw new Error(`Cycle not found: ${cycleId}`);

            const asset = cycle.asset;
            const startTime = new Date(cycle.cycle_started_at);

            // 2. Fetch Prices for 1h, 4h, 24h windows
            const price0 = await this.getHistoricalPrice(asset, cycle.cycle_started_at);
            const price1h = await this.getHistoricalPrice(asset, new Date(startTime.getTime() + 3600000).toISOString());
            const price4h = await this.getHistoricalPrice(asset, new Date(startTime.getTime() + 14400000).toISOString());
            const price24h = await this.getHistoricalPrice(asset, new Date(startTime.getTime() + 86400000).toISOString());

            if (!price0 || !price1h || !price4h || !price24h) {
                throw new Error(`Incomplete price data for ${asset}`);
            }

            // 3. Determine Directional Correctness
            const signalDir = cycle.final_signal || cycle.consensus_direction; // Bullish/Bearish
            const isCorrect = (pStatic: number, pFuture: number) => {
                const dir = signalDir.toUpperCase();
                return (dir === 'BULLISH' || dir === 'LONG') ? (pFuture > pStatic) : (pFuture < pStatic);
            };

            const correct1h = isCorrect(price0, price1h);
            const correct4h = isCorrect(price0, price4h);
            const correct24h = isCorrect(price0, price24h);

            // 4. Calculate Composite Score (Requirement 1: 1h=0.2, 4h=0.5, 24h=0.3)
            const compositeScore = (correct1h ? 0.20 : 0) + (correct4h ? 0.50 : 0) + (correct24h ? 0.30 : 0);
            const overallSuccess = compositeScore >= 0.5;

            console.log(`📊 [Postmortem] Results for ${asset}: 1h=${correct1h}, 4h=${correct4h}, 24h=${correct24h}. Score: ${compositeScore}`);

            // 5. ATOMIC UPDATE (via Supabase RPC)
            // This ensures Requirement 4: All succeed or none do.
            const { error: rpcError } = await supabase.rpc('process_prediction_postmortem', {
                p_cycle_id: cycleId,
                p_asset: asset,
                p_correct_1h: correct1h,
                p_correct_4h: correct4h,
                p_correct_24h: correct24h,
                p_composite_score: compositeScore,
                p_operator_id: 'Auto-Postmortem'
            });

            if (rpcError) {
                throw new Error(`RPC Failed: ${rpcError.message}`);
            }

            return {
                cycleId,
                asset,
                success: overallSuccess,
                compositeScore,
                details: { correct1h, correct4h, correct24h }
            };

        } catch (e: any) {
            console.error(`❌ [Postmortem] Failed to process ${cycleId}:`, e.message);
            // Failure logging is handled inside the atomic function (Requirement 4)
            // But we'll do a top-level log for visibility.
            return null;
        }
    }
}
