import axios from 'axios';
import * as crypto from 'crypto';

export class CoinbaseClient {
    private apiKey: string;
    private apiSecret: string;
    private baseUrl: string = 'https://api.coinbase.com/api/v3/brokerage';

    constructor() {
        this.apiKey = process.env.COINBASE_API_KEY || '';
        this.apiSecret = process.env.COINBASE_API_SECRET || '';

        if (!this.apiKey || !this.apiSecret) {
            console.warn('⚠️ Coinbase API keys missing! Trading will fail.');
        }
    }

    private getHeaders(method: string, path: string, body: string = '') {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const message = timestamp + method.toUpperCase() + path + body;
        const signature = crypto.createHmac('sha256', this.apiSecret).update(message).digest('hex');

        return {
            'CB-ACCESS-KEY': this.apiKey,
            'CB-ACCESS-SIGN': signature,
            'CB-ACCESS-TIMESTAMP': timestamp,
            'Content-Type': 'application/json'
        };
    }

    async getAccount() {
        // Coinbase V3 uses /accounts
        const path = '/v3/brokerage/accounts';
        const response = await axios.get(`https://api.coinbase.com${path}`, {
            headers: this.getHeaders('GET', path)
        });
        return response.data;
    }

    async placeOrder(order: {
        symbol: string;
        qty?: string;
        side: 'BUY' | 'SELL';
        order_type: 'MARKET' | 'LIMIT';
    }) {
        const path = '/v3/brokerage/orders';
        // Coinbase V3 order format differs from Alpaca
        const body = {
            client_order_id: crypto.randomUUID(),
            product_id: order.symbol,
            side: order.side,
            order_configuration: order.order_type === 'MARKET' ? {
                market_market_ioc: {
                    base_size: order.qty
                }
            } : {
                limit_limit_gtc: {
                    base_size: order.qty,
                    limit_price: '0' // Placeholder
                }
            }
        };
        const response = await axios.post(`https://api.coinbase.com${path}`, body, {
            headers: this.getHeaders('POST', path, JSON.stringify(body))
        });
        return response.data;
    }

    async getPositions() {
        // Mocking positions for now as V3 API mapping is complex
        console.log('[COINBASE] Fetching positions...');
        return [];
    }
}

export const coinbaseClient = new CoinbaseClient();
