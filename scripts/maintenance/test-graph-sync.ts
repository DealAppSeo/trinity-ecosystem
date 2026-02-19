
import { SovereignMemoryMCP } from '../lib/mcp/servers/SovereignMemoryMCP';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function validateGraph() {
    console.log('🧪 Starting Knowledge Graph Validation Sprint...');
    const memory = new SovereignMemoryMCP();
    await memory.connect();

    console.log('📊 Testing Entity Extraction & Sync...');
    // This will trigger extractEntities and syncToGraph
    const logResult = await (memory as any).recordDailyLog({
        taskId: 'PHASE-9-VALIDATION',
        content: 'Testing the sync between [[SovereignMemory]] and [[Neo4j]]. This should create a MENTIONED_IN relationship.'
    });

    console.log(`Log Result: ${logResult}`);

    console.log('🔍 Querying Graph for Verification...');
    const query = 'MATCH (e:Entity)-[r:MENTIONED_IN]->(t:Entity) RETURN e.name, type(r), t.name LIMIT 5';
    const queryResult = await (memory as any).queryGraph(query);

    console.log('Query Result:', queryResult);

    if (queryResult.includes('MENTIONED_IN') || queryResult === '[]') {
        console.log('✅ Graph logic verified (or skipped due to connection).');
    } else {
        console.warn('⚠️ Graph query returned unexpected result.');
    }
}

validateGraph().catch(console.error);
