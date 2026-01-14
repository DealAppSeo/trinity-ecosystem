import http from 'http';

const PORT = 8000;

const server = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.url === '/' || req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'online', version: '1.0.0-mock' }));
        console.log(`[PyBrain] Health check from ${req.socket.remoteAddress}`);
    } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not Found' }));
    }
});

server.listen(PORT, () => {
    console.log(`🧠 PyBrain Mock Server running at http://localhost:${PORT}`);
    console.log(`✅ UI should now show "Online" status.`);
});
