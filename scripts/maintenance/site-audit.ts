import fetch from 'node-fetch';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

const endpoints = [
    { name: 'Swarm Health', path: '/api/swarm-health' },
    { name: 'Swarm Control', path: '/api/swarm-control', method: 'POST', body: { action: 'PING' } },
    { name: 'Tasks List', path: '/api/tasks' },
    { name: 'Agents List', path: '/api/agents' }
];

async function audit() {
    console.log(`🔍 Starting Site Audit at ${BASE_URL}...`);
    for (const ep of endpoints) {
        try {
            const res = await fetch(`${BASE_URL}${ep.path}`, {
                method: ep.method || 'GET',
                body: ep.body ? JSON.stringify(ep.body) : undefined,
                headers: { 'Content-Type': 'application/json' }
            });
            const status = res.status;
            console.log(`${status === 200 ? '✅' : '❌'} [${status}] ${ep.name} (${ep.path})`);
            if (status !== 200) {
                const text = await res.text();
                console.log(`   Error: ${text.substring(0, 100)}`);
            }
        } catch (e: any) {
            console.log(`❌ [ERROR] ${ep.name} (${ep.path}): ${e.message}`);
        }
    }
    console.log("Audit complete.");
}

audit();
