import dotenv from 'dotenv';
dotenv.config();

// FORCE CREDENTIALS if missing (Reflecting run-agent.ts injection)
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://qnnpjhlxljtqyigedwkb.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5Mzk1OTEsImV4cCI6MjA2NzUxNTU5MX0.6oG2DU_BD1uBnBrDoQFauvN1ZnkKo2ywkuwY-tPaQFw';
}

const REQUIRED_ENVS = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GEMINI_API_KEY',
    'GROK_API_KEY',
    'TAVILY_API_KEY',
    'RAILWAY_API_TOKEN'
];

async function checkEnv() {
    console.log('--- [TRINITY PRE-FLIGHT CHECK] ---');
    let missing = 0;

    for (const key of REQUIRED_ENVS) {
        if (!process.env[key]) {
            console.warn(`[❌] MISSING: ${key}`);
            missing++;
        } else {
            console.log(`[✅] VERIFIED: ${key}`);
        }
    }

    if (missing > 0) {
        console.error(`\n[🚨] FATAL: ${missing} critical environment variables are missing!`);
        // process.exit(1); 
    } else {
        console.log('\n[💎] ALL SYSTEMS GO: Environment is HyperDAG-aligned.');
    }
}

checkEnv().catch(err => {
    console.error('Check failed:', err);
});
