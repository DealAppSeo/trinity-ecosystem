import axios from 'axios';

export class AlpacaClient {
    private apiKey: string;
    private secretKey: string;
    private baseUrl: string;

    constructor() {
        this.apiKey = process.env.ALPACA_API_KEY || '';
        this.secretKey = process.env.ALPACA_SECRET_KEY || '';
        this.baseUrl = process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets/v2';

        if (!this.apiKey || !this.secretKey) {
            console.warn('⚠️ Alpaca API keys missing! Trading will fail.');
        }
    }

    private getHeaders() {
        return {
            'APCA-API-KEY-ID': this.apiKey,
            'APCA-API-SECRET-KEY': this.secretKey,
            'Content-Type': 'application/json'
        };
    }

    async getAccount() {
        const response = await axios.get(`${this.baseUrl}/account`, { headers: this.getHeaders() });
        return response.data;
    }

    async placeOrder(order: {
        symbol: string;
        qty?: number;
        notional?: number;
        side: 'buy' | 'sell';
        type: 'market' | 'limit';
        time_in_force: 'day' | 'gtc';
    }) {
        const response = await axios.post(`${this.baseUrl}/orders`, order, { headers: this.getHeaders() });
        return response.data;
    }

    async getPositions() {
        const response = await axios.get(`${this.baseUrl}/positions`, { headers: this.getHeaders() });
        return response.data;
    }
}

export const alpacaClient = new AlpacaClient();
