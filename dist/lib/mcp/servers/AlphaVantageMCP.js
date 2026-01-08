"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlphaVantageMCP = void 0;
const BaseMCP_1 = require("./BaseMCP");
class AlphaVantageMCP extends BaseMCP_1.BaseMCP {
    constructor() {
        super('AlphaVantage');
        this.baseUrl = 'https://www.alphavantage.co/query';
        this.apiKey = process.env.ALPHA_VANTAGE_API_KEY || '';
    }
    async connect() {
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
    async getStockQuote(args) {
        const url = `${this.baseUrl}?function=GLOBAL_QUOTE&symbol=${args.symbol}&apikey=${this.apiKey}`;
        const res = await fetch(url);
        const data = await res.json();
        return JSON.stringify(data, null, 2);
    }
    async getSentiment(args) {
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
exports.AlphaVantageMCP = AlphaVantageMCP;
