import fs from 'fs';
import path from 'path';
import readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const targetPath = path.join(process.cwd(), '.env.local');

console.log('\n🔵 EASY SETUP: Configure your Environment Variables');
console.log('---------------------------------------------------');
console.log(`Target File: ${targetPath}\n`);

const config = {
    NEXT_PUBLIC_SUPABASE_URL: '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
    SUPABASE_SERVICE_KEY: ''
};

function ask(question: string): Promise<string> {
    return new Promise(resolve => {
        rl.question(question, (answer) => {
            resolve(answer.trim());
        });
    });
}

async function run() {
    try {
        console.log('Please paste your keys from Railway (Right Copy -> Paste):\n');

        config.NEXT_PUBLIC_SUPABASE_URL = await ask('1. Enter NEXT_PUBLIC_SUPABASE_URL: ');
        while (!config.NEXT_PUBLIC_SUPABASE_URL || !config.NEXT_PUBLIC_SUPABASE_URL.startsWith('http')) {
            config.NEXT_PUBLIC_SUPABASE_URL = await ask('   ❌ Invalid URL. Must start with "https://". Try again: ');
        }

        config.NEXT_PUBLIC_SUPABASE_ANON_KEY = await ask('2. Enter NEXT_PUBLIC_SUPABASE_ANON_KEY: ');
        while (!config.NEXT_PUBLIC_SUPABASE_ANON_KEY || config.NEXT_PUBLIC_SUPABASE_ANON_KEY.length < 20) {
            config.NEXT_PUBLIC_SUPABASE_ANON_KEY = await ask('   ❌ Invalid Key. Seems too short. Try again: ');
        }

        config.SUPABASE_SERVICE_KEY = await ask('3. Enter SUPABASE_SERVICE_KEY: ');
        while (!config.SUPABASE_SERVICE_KEY || config.SUPABASE_SERVICE_KEY.length < 20) {
            config.SUPABASE_SERVICE_KEY = await ask('   ❌ Invalid Key. Seems too short. Try again: ');
        }

        const fileContent = `NEXT_PUBLIC_SUPABASE_URL=${config.NEXT_PUBLIC_SUPABASE_URL}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${config.NEXT_PUBLIC_SUPABASE_ANON_KEY}\nSUPABASE_SERVICE_KEY=${config.SUPABASE_SERVICE_KEY}\n`;

        fs.writeFileSync(targetPath, fileContent);

        console.log('\n✅ Success! .env.local created.');
        console.log('---------------------------------------------------');
        console.log('👉 Now restarting your scheduler to pick up changes...');
        process.exit(0);

    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

run();
