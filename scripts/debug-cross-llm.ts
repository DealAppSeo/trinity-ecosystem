import path from 'path';
import fs from 'fs';

function loadEnv(file: string): void {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnv(path.resolve(__dirname, '..', '..', 'repid-engine', '.env'));

import { compareAnswers } from '../lib/trust/cross-llm-verifier';

(async () => {
  for (const p of [
    'Is dark mode better for productivity?',
    'How long does it take to learn a new language?',
    'When will artificial general intelligence arrive?',
  ]) {
    const r = await compareAnswers(p, { persist: false });
    console.log(`\n--- "${p}" — score=${r.agreement_score} ---`);
    for (const a of r.answers) {
      console.log(`[${a.provider}/${a.model}] ${a.error ? 'ERROR: ' + a.error : `(len=${a.answer.length}) ${a.answer.slice(0, 250)}`}`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }
})();
