
import { GuardrailsMCP } from '../lib/mcp/servers/GuardrailsMCP';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function testGovernance() {
    console.log('📜 Testing Governance Ledger Sync...');
    const guardrails = new GuardrailsMCP();

    // We don't need to initialize the whole manager for a unit test
    const result = await (guardrails as any).logGovernanceEvent({
        event_type: 'VIOLATION',
        summary: 'Unit Test: Constitutional Violation detected',
        details: 'Testing the sync from GuardrailsMCP to Airtable Governance Ledger.'
    });

    console.log(`Result: ${result}`);
}

testGovernance().catch(console.error);
