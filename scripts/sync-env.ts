import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

/**
 * sync-env.ts
 * A central utility to manage API keys and sync .env.local across the Trinity monorepo.
 */

async function syncEnv() {
    const rootDir = process.cwd();
    const envLocalPath = path.join(rootDir, '.env.local');
    const sharedEnvPath = path.join(rootDir, '..', 'trinity-symphony-shared', '.env.local');

    console.log('--- Trinity Environment Sync ---');

    if (!fs.existsSync(envLocalPath)) {
        console.error('❌ .env.local not found in root. Run this from trinity-ecosystem directory.');
        return;
    }

    // Load current keys
    const envConfig = dotenv.parse(fs.readFileSync(envLocalPath));
    const keyCount = Object.keys(envConfig).filter(k => k.endsWith('_KEY') || k.endsWith('_TOKEN')).length;
    console.log(`✅ Loaded ${keyCount} secrets from ${envLocalPath}`);

    // Option 1: Sync to Shared Library (Parity check)
    if (fs.existsSync(path.dirname(sharedEnvPath))) {
        fs.writeFileSync(sharedEnvPath, Object.entries(envConfig).map(([k, v]) => `${k}=${v}`).join('\n'));
        console.log(`✅ Synced keys to shared library: ${sharedEnvPath}`);
    }

    // Option 2: Future Railway Pull (Placeholder for Railway CLI integration)
    const railwayToken = envConfig.RAILWAY_API_TOKEN;
    if (railwayToken) {
        console.log('ℹ️ Railway Token detected. In the next version, I can pull variables directly via CLI.');
    }

    console.log('-------------------------------');
    console.log('SUGGESTION: Keep your keys in a single master .env.local and run this script to propagate updates.');
}

syncEnv().catch(console.error);
