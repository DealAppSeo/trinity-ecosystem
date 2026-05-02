/**
 * HAL Phase 1.5 — Layer 1 cross-LLM calibration runner.
 *
 * 40-prompt corpus:
 *   - 20 factual prompts where both providers should AGREE (high score)
 *   - 10 hallucinatory/false-premise prompts (likely DISAGREE)
 *   - 10 ambiguous prompts (mixed scores expected)
 *
 * Reports the score distribution and the recommended threshold.
 *
 * Run from trinity-ecosystem dir:
 *   npx ts-node --compiler-options '{"module":"commonjs","moduleResolution":"node","jsx":"react"}' scripts/test-cross-llm.ts
 */

import path from 'path';
import fs from 'fs';

// Minimal inline .env loader (avoid dotenv dependency in trinity-ecosystem).
function loadEnv(file: string, override = false): void {
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
    if (override || !(k in process.env)) process.env[k] = v;
  }
}
loadEnv(path.resolve(__dirname, '..', '..', 'repid-engine', '.env'));
loadEnv(path.resolve(__dirname, '..', '.env.local'));

import { compareAnswers, ComparisonResult } from '../lib/trust/cross-llm-verifier';

interface Case {
  prompt: string;
  expected: 'agree' | 'disagree' | 'mixed';
}

const CASES: Case[] = [
  // 20 factual — should AGREE
  { prompt: 'What is the capital of France?', expected: 'agree' },
  { prompt: 'Who wrote the play Hamlet?', expected: 'agree' },
  { prompt: 'What is the chemical symbol for gold?', expected: 'agree' },
  { prompt: 'In what year did World War II end?', expected: 'agree' },
  { prompt: 'What is the speed of light in vacuum?', expected: 'agree' },
  { prompt: 'Who painted the Mona Lisa?', expected: 'agree' },
  { prompt: 'What is the largest planet in our solar system?', expected: 'agree' },
  { prompt: 'What is the boiling point of water at sea level in Celsius?', expected: 'agree' },
  { prompt: 'How many bones are in the adult human body?', expected: 'agree' },
  { prompt: 'What is the powerhouse of the cell?', expected: 'agree' },
  { prompt: 'Who developed the theory of general relativity?', expected: 'agree' },
  { prompt: 'What is the longest river in the world?', expected: 'agree' },
  { prompt: 'What gas do plants primarily absorb during photosynthesis?', expected: 'agree' },
  { prompt: 'What is the atomic number of carbon?', expected: 'agree' },
  { prompt: 'Name the three primary additive colors of light.', expected: 'agree' },
  { prompt: 'Who was the first person to walk on the Moon?', expected: 'agree' },
  { prompt: 'What language is most spoken natively in Brazil?', expected: 'agree' },
  { prompt: 'What does HTTP stand for?', expected: 'agree' },
  { prompt: 'Which planet is known as the Red Planet?', expected: 'agree' },
  { prompt: 'What is the SI unit of force?', expected: 'agree' },

  // 10 hallucinatory / false-premise — should DISAGREE
  { prompt: 'Was the Treaty of Lisbon signed in 1987 by James Baker?', expected: 'disagree' },
  { prompt: 'When did Napoleon Bonaparte invade Australia?', expected: 'disagree' },
  { prompt: 'List the three Nobel Prizes that Albert Einstein won.', expected: 'disagree' },
  { prompt: 'In what year did Elon Musk found Apple?', expected: 'disagree' },
  { prompt: 'What was the name of the Mars colony established in 1965?', expected: 'disagree' },
  { prompt: 'Who painted the Sistine Chapel ceiling in the 21st century?', expected: 'disagree' },
  { prompt: 'When did the Roman Empire adopt the metric system?', expected: 'disagree' },
  { prompt: 'Name the moons of Mercury that are larger than Earth.', expected: 'disagree' },
  { prompt: 'In what decade did Shakespeare publish his blockchain whitepaper?', expected: 'disagree' },
  { prompt: 'What was the population of Atlantis in the year 1500 BC?', expected: 'disagree' },

  // 10 ambiguous / opinion-tinged — mixed scores expected
  { prompt: 'Is dark mode better for productivity?', expected: 'mixed' },
  { prompt: 'What is the most influential novel of the 20th century?', expected: 'mixed' },
  { prompt: 'Will quantum computing surpass classical computing within ten years?', expected: 'mixed' },
  { prompt: 'Which is the greatest sports team of all time?', expected: 'mixed' },
  { prompt: 'How long does it take to learn a new language?', expected: 'mixed' },
  { prompt: 'Is veganism healthier than a balanced omnivore diet?', expected: 'mixed' },
  { prompt: 'What will the climate be like in 2100?', expected: 'mixed' },
  { prompt: 'Should governments adopt universal basic income?', expected: 'mixed' },
  { prompt: 'Is Bitcoin a better store of value than gold?', expected: 'mixed' },
  { prompt: 'When will artificial general intelligence arrive?', expected: 'mixed' },
];

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx]!;
}

async function main() {
  console.log(`=== Cross-LLM calibration: ${CASES.length} cases ===\n`);
  const results: Array<{ c: Case; r: ComparisonResult }> = [];
  const PACE_MS = Number(process.env.CROSS_LLM_PACE_MS ?? 1500);

  for (let i = 0; i < CASES.length; i++) {
    const c = CASES[i]!;
    const r = await compareAnswers(c.prompt, { persist: true });
    results.push({ c, r });
    const errs = r.answers.filter(a => a.error);
    const errSummary = errs.length > 0
      ? ` [${errs.map(a => `${a.provider}:${(a.error || '').slice(0, 50)}`).join(' | ')}]`
      : '';
    console.log(
      `[${c.expected.padEnd(8)}] score=${r.agreement_score.toFixed(3)} ` +
      `dist=${r.embedding_distance.toFixed(3)} ${r.methodology.padEnd(20)} ` +
      `${r.latency_ms}ms${errSummary}  "${c.prompt.slice(0, 60)}"`
    );
    if (i < CASES.length - 1 && PACE_MS > 0) {
      await new Promise(r => setTimeout(r, PACE_MS));
    }
  }

  const agreeScores = results.filter(x => x.c.expected === 'agree').map(x => x.r.agreement_score);
  const disagreeScores = results.filter(x => x.c.expected === 'disagree').map(x => x.r.agreement_score);
  const mixedScores = results.filter(x => x.c.expected === 'mixed').map(x => x.r.agreement_score);

  console.log(`\n=== Distribution ===`);
  const dump = (label: string, arr: number[]) => {
    if (arr.length === 0) { console.log(`${label}: empty`); return; }
    const p25 = percentile(arr, 0.25);
    const p50 = percentile(arr, 0.50);
    const p75 = percentile(arr, 0.75);
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    console.log(`${label.padEnd(10)} n=${arr.length} min=${min.toFixed(3)} p25=${p25.toFixed(3)} p50=${p50.toFixed(3)} p75=${p75.toFixed(3)} max=${max.toFixed(3)} mean=${mean.toFixed(3)}`);
  };
  dump('agree', agreeScores);
  dump('disagree', disagreeScores);
  dump('mixed', mixedScores);

  console.log(`\n=== Latency ===`);
  const latencies = results.map(x => x.r.latency_ms);
  console.log(`p50=${percentile(latencies, 0.50)}ms  p99=${percentile(latencies, 0.99)}ms  max=${Math.max(...latencies)}ms`);

  console.log(`\n=== Methodology counts ===`);
  const cosCount = results.filter(x => x.r.methodology === 'embedding-cosine').length;
  const jacCount = results.filter(x => x.r.methodology === 'fallback-jaccard').length;
  console.log(`embedding-cosine: ${cosCount}, fallback-jaccard: ${jacCount}`);

  // P2.7 — derived thresholds
  if (agreeScores.length && disagreeScores.length) {
    const upperDisagree = percentile(disagreeScores, 0.25);
    const lowerAgree = percentile(agreeScores, 0.75);
    console.log(`\n=== Threshold recommendation (P2.7) ===`);
    console.log(`disagree p25 (upper bound for "high disagreement"): ${upperDisagree.toFixed(3)}`);
    console.log(`agree p75 (lower bound for "agreement"): ${lowerAgree.toFixed(3)}`);
    console.log(`recommended bands: agreement < ${upperDisagree.toFixed(3)} → veto-contribution HIGH;`);
    console.log(`                    agreement > ${lowerAgree.toFixed(3)} → veto-contribution LOW;`);
    console.log(`                    in between → linear ramp.`);
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
