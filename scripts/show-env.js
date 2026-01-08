
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
const content = fs.readFileSync(envPath, 'utf8');
const lines = content.split('\n');
const keyLine = lines.find(l => l.startsWith('SUPABASE_SERVICE_ROLE_KEY='));
if (keyLine) {
    console.log(keyLine.split('=')[1].trim());
} else {
    console.log("NOT FOUND");
}
