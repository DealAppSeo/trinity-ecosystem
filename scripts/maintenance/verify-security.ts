import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const BASE_URL = 'http://localhost:3000'; // Make sure server is running

async function testSecurity() {
    console.log('--- [TRINITY SECURITY VERIFICATION] ---');

    const endpoints = [
        { url: '/api/swarm-control', method: 'POST', body: { action: 'FLUSH_GHOSTS' } },
        { url: '/api/captain', method: 'POST', body: { action: 'UPDATE_NORTH_STAR', north_star: 'HACKED' } },
        { url: '/api/tasks', method: 'POST', body: { title: 'Unauthorized Task' } },
    ];

    for (const ep of endpoints) {
        console.log(`\nTesting ${ep.method} ${ep.url} (Unauthenticated)...`);
        try {
            const res = await fetch(`${BASE_URL}${ep.url}`, {
                method: ep.method,
                body: JSON.stringify(ep.body),
                headers: { 'Content-Type': 'application/json' }
            });

            if (res.status === 401) {
                console.log(`✅ BLOCKED: ${res.status} ${res.statusText}`);
            } else {
                console.log(`❌ VULNERABLE: ${res.status} ${res.statusText}`);
            }
        } catch (e: any) {
            console.log(`⚠️ Note: Connection failed (is dev server running?). Detail: ${e.message}`);
        }
    }

    console.log('\nTesting with VALID Admin Key...');
    const adminKey = process.env.TRINITY_ADMIN_KEY;
    if (!adminKey) {
        console.log('❌ ABORTED: TRINITY_ADMIN_KEY not found in .env.local');
        return;
    }

    try {
        const res = await fetch(`${BASE_URL}/api/swarm-control`, {
            method: 'POST',
            body: JSON.stringify({ action: 'REBOOT_SWARM' }),
            headers: {
                'Content-Type': 'application/json',
                'x-trinity-admin-key': adminKey
            }
        });

        if (res.status === 200) {
            console.log('✅ AUTH SUCCESS: Admin Key accepted.');
        } else {
            console.log(`❌ AUTH FAILED: ${res.status} ${res.statusText}`);
        }
    } catch (e: any) {
        console.log('⚠️ Note: Connection failed.');
    }
}

testSecurity();
