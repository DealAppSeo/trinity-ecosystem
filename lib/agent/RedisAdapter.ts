import { Redis as UpstashRedis } from '@upstash/redis';
import Redis from 'ioredis';

/**
 * [ANTIGRAVITY] Redis Adapter for Trinity Swarm.
 * Supports DragonflyDB (TCP/TLS) as primary and Upstash Redis (REST) as fallback.
 */
export class RedisAdapter {
    private static instance: RedisAdapter;
    private redis: any; // Can be ioredis or @upstash/redis
    private type: 'ioredis' | 'upstash' | 'mock' = 'mock';

    private constructor() {
        // [PHASE 14] Multi-Provider Fallback (DragonflyDB Primary, Upstash Fallback)
        const dragonflyUrl = process.env.DRAGONFLY_DB_URL;
        const dragonflyPort = parseInt(process.env.DRAGONFLY_DB_PORT || '6385');
        const dragonflyKey = process.env.DRAGONFLY_ACCESS_KEY;

        const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
        const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

        if (dragonflyUrl && dragonflyKey) {
            console.log(`[REDIS] ⚡ Initializing Primary (DragonflyDB) on ${dragonflyUrl}:${dragonflyPort}...`);
            let retryCount = 0;
            const maxRetries = 3;
            const backoffDelays = [5000, 30000, 300000]; // 5s, 30s, 5min

            try {
                this.redis = new Redis({
                    host: dragonflyUrl,
                    port: dragonflyPort,
                    password: dragonflyKey,
                    tls: {}, // Port 6385 usually requires TLS
                    retryStrategy: (times) => {
                        if (times > maxRetries) {
                            if (retryCount === maxRetries) {
                                retryCount++;
                                import('../notification/NotificationManager').then(({ notificationManager }) => {
                                    notificationManager.sendTelegram(`🚨 *[REDIS CRITICAL]* persistent connection failure to DragonflyDB after ${maxRetries} retries.`);
                                });
                            }
                            return null; // Stop retrying
                        }
                        return backoffDelays[times - 1];
                    }
                });
                this.type = 'ioredis';

                this.redis.on('error', (err: any) => {
                    console.error('[REDIS] ❌ Dragonfly Connection Error:', err.message);
                });
            } catch (e) {
                console.error('[REDIS] ❌ Failed to create Dragonfly client, falling back...');
            }
        }

        if (this.type === 'mock' && upstashUrl && upstashToken) {
            console.log('[REDIS] 🐢 Initializing Fallback (Upstash Redis REST)...');
            this.redis = new UpstashRedis({ url: upstashUrl, token: upstashToken });
            this.type = 'upstash';
        }

        if (this.type === 'mock') {
            console.warn('[REDIS] ⚠️ No database configuration found. Running in MOCK mode.');
            this.redis = {
                get: async () => null,
                set: async () => 'OK',
                del: async () => 0,
                incr: async () => 1,
                expire: async () => 1
            } as any;
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
