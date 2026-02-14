
const adminKey = 'MEL';
const baseUrl = 'http://localhost:3000'; // Assuming local dev

async function testApi() {
    console.log('--- 🧪 TESTING SWARM CONTROL API ---');

    try {
        const res = await fetch(`${baseUrl}/api/swarm-control`, {
            method: 'POST',
            body: JSON.stringify({ action: 'REBOOT_SWARM' }),
            headers: {
                'Content-Type': 'application/json',
                'x-trinity-admin-key': adminKey
            }
        });

        const data = await res.json();
        console.log('Status:', res.status);
        console.log('Response:', data);
    } catch (e: any) {
        console.error('Fetch failed:', e.message);
    }
}

testApi();
