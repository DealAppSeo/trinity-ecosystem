const https = require('https');
require('dotenv').config({ path: '.env.local' });

async function registerCommands() {
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!BOT_TOKEN) {
        console.error("TELEGRAM_BOT_TOKEN is missing");
        return;
    }

    const commands = [
        { command: 'health', description: 'Swarm health check' },
        { command: 'status', description: 'Sprint status + task queue' },
        { command: 'wake', description: 'Wake all agents' },
        { command: 'tasks', description: 'Show pending task list' },
        { command: 'sprint', description: 'Sprint controls' },
        { command: 'approve', description: 'Review HITL queue' },
        { command: 'agents', description: 'All 12 agent statuses' },
        { command: 'report', description: 'Trigger morning report now' },
        { command: 'newtask', description: 'Guided task creation flow' }
    ];

    const data = JSON.stringify({ commands });

    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${BOT_TOKEN}/setMyCommands`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    const req = https.request(options, res => {
        let responseBody = '';
        res.on('data', chunk => responseBody += chunk);
        res.on('end', () => {
            console.log("Response:", responseBody);
        });
    });

    req.on('error', error => console.error(error));
    req.write(data);
    req.end();
}

registerCommands();
