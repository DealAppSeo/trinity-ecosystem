/**
 * constants.ts
 * 
 * MASTER ASSET UNIVERSE (v3.2)
 * All 16 assets are defined here. This is the single source of truth.
 * 11 are Alpaca-tradable, 5 are signal-only.
 */

export interface Asset {
    symbol: string;
    coingeckoId: string;
    alpacaSymbol: string | null;
    atsMonitored: boolean;
    alpacaTradable: boolean;
}

export const ATS_ASSETS: Asset[] = [
    // ATS CORE (Tradable)
    { symbol: 'BTC', coingeckoId: 'bitcoin', alpacaSymbol: 'BTC/USD', atsMonitored: true, alpacaTradable: true },
    { symbol: 'ETH', coingeckoId: 'ethereum', alpacaSymbol: 'ETH/USD', atsMonitored: true, alpacaTradable: true },
    { symbol: 'SOL', coingeckoId: 'solana', alpacaSymbol: 'SOL/USD', atsMonitored: true, alpacaTradable: true },
    { symbol: 'XRP', coingeckoId: 'ripple', alpacaSymbol: 'XRP/USD', atsMonitored: true, alpacaTradable: true },
    { symbol: 'DOGE', coingeckoId: 'dogecoin', alpacaSymbol: 'DOGE/USD', atsMonitored: true, alpacaTradable: true },
    { symbol: 'AVAX', coingeckoId: 'avalanche-2', alpacaSymbol: 'AVAX/USD', atsMonitored: true, alpacaTradable: true },
    { symbol: 'LINK', coingeckoId: 'chainlink', alpacaSymbol: 'LINK/USD', atsMonitored: true, alpacaTradable: true },

    // ATS EXTENDED (Tradable)
    { symbol: 'DOT', coingeckoId: 'polkadot', alpacaSymbol: 'DOT/USD', atsMonitored: true, alpacaTradable: true },
    { symbol: 'AAVE', coingeckoId: 'aave', alpacaSymbol: 'AAVE/USD', atsMonitored: true, alpacaTradable: true },
    { symbol: 'LTC', coingeckoId: 'litecoin', alpacaSymbol: 'LTC/USD', atsMonitored: true, alpacaTradable: true },
    { symbol: 'UNI', coingeckoId: 'uniswap', alpacaSymbol: 'UNI/USD', atsMonitored: true, alpacaTradable: true },

    // SIGNAL ONLY (No order placement)
    { symbol: 'BNB', coingeckoId: 'binancecoin', alpacaSymbol: null, atsMonitored: true, alpacaTradable: false },
    { symbol: 'ADA', coingeckoId: 'cardano', alpacaSymbol: null, atsMonitored: true, alpacaTradable: false },
    { symbol: 'TRX', coingeckoId: 'tron', alpacaSymbol: null, atsMonitored: true, alpacaTradable: false },

    // AI TOKEN TRACKING (Signal Only)
    { symbol: 'TAO', coingeckoId: 'bittensor', alpacaSymbol: null, atsMonitored: true, alpacaTradable: false },
    { symbol: 'FET', coingeckoId: 'fetch-ai', alpacaSymbol: null, atsMonitored: true, alpacaTradable: false }
];

export const TRADABLE_ASSETS = ATS_ASSETS.filter(a => a.alpacaTradable);
export const SIGNAL_ONLY_ASSETS = ATS_ASSETS.filter(a => !a.alpacaTradable);

/**
 * REFACTORING AID: Returns a map of symbol -> coingeckoId
 * For components like MCLPostmortemHandler that need CG IDs.
 */
export const ASSET_CG_MAP: Record<string, string> = ATS_ASSETS.reduce((acc, asset) => {
    acc[asset.symbol] = asset.coingeckoId;
    return acc;
}, {} as Record<string, string>);
