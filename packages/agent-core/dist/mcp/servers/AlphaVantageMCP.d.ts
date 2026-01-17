import { BaseMCP } from './BaseMCP';
export declare class AlphaVantageMCP extends BaseMCP {
    private apiKey;
    private baseUrl;
    constructor();
    connect(): Promise<void>;
    private getStockQuote;
    private getSentiment;
}
