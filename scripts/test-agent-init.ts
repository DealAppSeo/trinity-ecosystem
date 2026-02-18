import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function testImport() {
    console.log('Attempting to import ConstitutionalAgent...');
    try {
        const { ConstitutionalAgent } = await import('./lib/agent/ConstitutionalAgent');
        console.log('Import successful!');
        const agent = new ConstitutionalAgent({ name: 'trinity-orch' } as any);
        console.log('Agent instance created!');
        console.log('Agent Providers:', agent.availableProviders);
    } catch (e: any) {
        console.error('Import or init failed:', e.message);
        console.error(e.stack);
    }
}

testImport();
