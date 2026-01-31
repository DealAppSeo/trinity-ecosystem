
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const criticalVars = [
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GEMINI_API_KEY',
    'GROK_API_KEY',
    'DEEPSEEK_API_KEY',
    'GROQ_API_KEY',
    'FIREWORKS_API_KEY',
    'TOGETHER_API_KEY',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ANFIS_URL'
];

console.log('--- [ENV VAR AUDIT] ---');
criticalVars.forEach(v => {
    const value = process.env[v];
    if (!value) {
        console.log(`❌ ${v}: MISSING`);
    } else if (value.includes(' ') || value.length < 5) {
        console.log(`⚠️ ${v}: POTENTIALLY MALFORMED`);
    } else {
        console.log(`✅ ${v}: OK`);
    }
});
console.log('-----------------------');
