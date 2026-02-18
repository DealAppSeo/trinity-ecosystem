import { Redis } from '@upstash/redis';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function testRedis() {
    console.log('Testing Redis connection...');
    console.log('URL:', process.env.UPSTASH_REDIS_REST_URL);

    try {
        const redis = new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL!,
            token: process.env.UPSTASH_REDIS_REST_TOKEN!,
        });

        const ping = await redis.ping();
        console.log('Ping Result:', ping);

        await redis.set('test_key', 'Waking the Swarm ' + new Date().toISOString());
        const val = await redis.get('test_key');
        console.log('Test value retrieve:', val);

        console.log('✅ Redis connection SUCCESSFUL');
    } catch (e: any) {
        console.error('❌ Redis connection FAILED:', e.message);
    }
}

testRedis();
