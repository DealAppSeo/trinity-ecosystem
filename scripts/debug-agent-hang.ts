import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function debugInit() {
    console.log('[DEBUG] Starting initialization trace...');

    try {
        console.log('[DEBUG] Importing ConstitutionalAgent...');
        const { ConstitutionalAgent } = await import('./lib/agent/ConstitutionalAgent');
        console.log('[DEBUG] Import finished.');

        console.log('[DEBUG] Creating ConstitutionalAgent instance...');
        const agent = new ConstitutionalAgent({ name: 'trinity-orch' } as any);
        console.log('[DEBUG] Constructor finished successfully.');

        console.log('[DEBUG] Agent Name:', agent.name);
        console.log('[DEBUG] Available Providers:', agent.availableProviders);

        process.exit(0);
    } catch (e: any) {
        console.error('[DEBUG] CRITICAL FAILURE:', e.message);
        console.error(e.stack);
        process.exit(1);
    }
}

// Add timeout to prevent hanging the script forever
setTimeout(() => {
    console.error('[DEBUG] TIMEOUT: Initialization took longer than 30s. Hanging?');
    process.exit(1);
}, 30000);

debugInit();
