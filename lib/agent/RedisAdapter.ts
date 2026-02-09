
import { Redis } from '@upstash/redis';

/**
 * [ANTIGRAVITY] Redis Adapter for Trinity Swarm.
 * Uses Upstash Redis for global state persistence, circuit breakers, and task temporary memory.
 */
export class RedisAdapter {
    private static instance: RedisAdapter;
    private redis: Redis;

    private constructor() {
        const url = process.env.UPSTASH_REDIS_REST_URL;
        const token = process.env.UPSTASH_REDIS_REST_TOKEN;

        if (!url || !token) {
            console.warn('[REDIS] ⚠️ UPSTASH_REDIS_REST_URL or TOKEN missing. Adapter running in MOCK mode.');
            // Mock redis for development
            this.redis = {
                get: async () => null,
                set: async () => 'OK',
                del: async () => 0,
                incr: async () => 1,
                expire: async () => 1
            } as any;
        } else {
            this.redis = new Redis({
                url,
                token,
            });
        }
    }

    public static getInstance(): RedisAdapter {
        if (!RedisAdapter.instance) {
            RedisAdapter.instance = new RedisAdapter();
        }
        return RedisAdapter.instance;
    }

    async get(key: string): Promise<any> {
        try {
            return await this.redis.get(key);
        } catch (e) {
            console.error(`[REDIS] Error getting key ${key}:`, e);
            return null;
        }
    }

    async set(key: string, value: any, expireSeconds?: number): Promise<void> {
        try {
            await this.redis.set(key, value);
            if (expireSeconds) {
                await this.redis.expire(key, expireSeconds);
            }
        } catch (e) {
            console.error(`[REDIS] Error setting key ${key}:`, e);
        }
    }

    async del(key: string): Promise<void> {
        try {
            await this.redis.del(key);
        } catch (e) {
            console.error(`[REDIS] Error deleting key ${key}:`, e);
        }
    }

    /**
     * Rate limiter for LLM calls/tasks.
     */
    async hitRateLimit(identifier: string, limit: number, windowSeconds: number): Promise<boolean> {
        const key = `rate_limit:${identifier}`;
        try {
            const count = await this.redis.incr(key);
            if (count === 1) {
                await this.redis.expire(key, windowSeconds);
            }
            return count <= limit;
        } catch (e) {
            return true; // Fail open
        }
    }
}
