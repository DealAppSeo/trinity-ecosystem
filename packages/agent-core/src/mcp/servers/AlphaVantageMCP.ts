
import { BaseMCP } from './BaseMCP';
import { MCPTool } from '../types';

export class AlphaVantageMCP extends BaseMCP {
    private apiKey: string;
    private baseUrl = 'https://www.alphavantage.co/query';

    constructor() {
        super('AlphaVantage');
        this.apiKey = process.env.ALPHA_VANTAGE_API_KEY || '';
    }

    async connect(): Promise<void> {
        if (!this.apiKey) {
            throw new Error('ALPHA_VANTAGE_API_KEY is missing in environment variables');
        }

        // Register Tools
        this.registerTool({
            name: 'get_stock_quote',
            description: 'Get real-time stock quote for a given symbol',
            schema: {
                type: 'object',
                properties: {
                    symbol: { type: 'string', description: 'Stock symbol (e.g., TSLA)' }
                },
                required: ['symbol']
            },
            execute: this.getStockQuote.bind(this)
        });

        this.registerTool({
            name: 'get_market_sentiment',
            description: 'Get news and sentiment for a ticker',
            schema: {
                type: 'object',
                properties: {
                    symbol: { type: 'string' }
                },
                required: ['symbol']
            },
            execute: this.getSentiment.bind(this)
        });
    }

    private async getStockQuote(args: { symbol: string }): Promise<string> {
        const url = `${this.baseUrl}?function=GLOBAL_QUOTE&symbol=${args.symbol}&apikey=${this.apiKey}`;
        const res = await fetch(url);
        const data = await res.json();
        return JSON.stringify(data, null, 2);
    }

    private async getSentiment(args: { symbol: string }): Promise<string> {
        const url = `${this.baseUrl}?function=NEWS_SENTIMENT&tickers=${args.symbol}&apikey=${this.apiKey}`;
        const res = await fetch(url);
        const data = await res.json();
        // Limit output to avoid token limits
        if (data.feed) {
            data.feed = data.feed.slice(0, 3);
        }
        return JSON.stringify(data, null, 2);
    }
}
