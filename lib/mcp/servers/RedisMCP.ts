
import { BaseMCP } from './BaseMCP';

/**
 * RedisMCP Server
 * Allows agents to persist and retrieve state outside of Postgres.
 * Useful for fast caching, rate limiting, or cross-agent blackboard patterns.
 */
export class RedisMCP extends BaseMCP {
    private redisUrl: string;
    private redisToken: string;

    constructor() {
        super('Redis');
        this.redisUrl = process.env.UPSTASH_REDIS_REST_URL || '';
        this.redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || '';
    }

    async connect(): Promise<void> {
        if (!this.redisUrl || !this.redisToken) {
            throw new Error('Redis credentials (UPSTASH) are missing.');
        }

        this.registerTool({
            name: 'redis_set',
            description: 'Set a value in the Redis cache.',
            schema: {
                type: 'object',
                properties: {
                    key: { type: 'string' },
                    value: { type: 'string' },
                    ex: { type: 'number', description: 'Expiry in seconds' }
                },
                required: ['key', 'value']
            },
            execute: async (args: any) => {
                const cmd = args.ex ? ['SET', args.key, args.value, 'EX', args.ex] : ['SET', args.key, args.value];
                return await this.callRedis(cmd);
            }
        });

        this.registerTool({
            name: 'redis_get',
            description: 'Get a value from the Redis cache.',
            schema: {
                type: 'object',
                properties: {
                    key: { type: 'string' }
                },
                required: ['key']
            },
            execute: async (args: any) => {
                return await this.callRedis(['GET', args.key]);
            }
        });

        this.registerTool({
            name: 'redis_hset',
            description: 'Set a field in a Redis hash.',
            schema: {
                type: 'object',
                properties: {
                    hash: { type: 'string' },
                    field: { type: 'string' },
                    value: { type: 'string' }
                },
                required: ['hash', 'field', 'value']
            },
            execute: async (args: any) => {
                return await this.callRedis(['HSET', args.hash, args.field, args.value]);
            }
        });

        this.isConnected = true;
    }

    private async callRedis(command: string[]): Promise<string> {
        try {
            const response = await fetch(`${this.redisUrl}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.redisToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(command)
            });
            const result = await response.json();
            return JSON.stringify(result.result || result);
        } catch (e: any) {
            return `Redis Error: ${e.message}`;
        }
    }
}
