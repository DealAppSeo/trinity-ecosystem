/**
 * HAL Phase 1.5 — Layer 1 Cross-LLM Textual Verifier
 *
 * Extracted (not refactored) from BFTEngine.ts — that engine compares the
 * providers' self-reported belief scores; this module compares their
 * natural-language answers via embedding cosine similarity. Different shape,
 * different patent application (factual cross-check on textual answers).
 *
 * BFTEngine.ts is intentionally untouched — it has 1 caller (Next.js
 * /api/trust/bft route) that depends on its existing JSON contract.
 *
 * Provider pair (selected for SBFA training-data diversity):
 *   - groq llama-3.1-8b-instant  (Meta / Llama training corpus)
 *   - groq openai/gpt-oss-20b    (OpenAI / GPT training corpus)
 * Provider redundancy is reduced (both behind groq); training-data
 * diversity is preserved. Initial spec called for cerebras as the
 * second provider, but the cerebras free-tier daily quota is
 * exhausted at calibration time — see PHASE_1_5_CC2_REPORT.md
 * Phase 2 surprise #2.
 *
 * Embedding: openai text-embedding-3-small (1536-dim, $0.00002/call).
 * Fallback: token Jaccard similarity if embedding API unavailable
 * (current openai key has no remaining billing quota — see Phase 2
 * surprise #1).
 *
 * Persistence: cross_llm_comparisons table (Supabase).
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

export interface ProviderAnswer {
  provider: string;
  model: string;
  answer: string;
  latency_ms: number;
  error?: string;
}

export interface ComparisonResult {
  prompt_hash: string;
  answers: ProviderAnswer[];
  agreement_score: number;
  embedding_distance: number;
  methodology: 'embedding-cosine' | 'fallback-jaccard';
  latency_ms: number;
}

export interface CompareOptions {
  provider1ApiKey?: string;
  provider2ApiKey?: string;
  openaiApiKey?: string;
  provider1?: string;       // 'groq' | 'cerebras' | 'openrouter' (any OpenAI-compat endpoint)
  provider2?: string;
  provider1Endpoint?: string;
  provider2Endpoint?: string;
  provider1Model?: string;
  provider2Model?: string;
  embeddingModel?: string;
  timeoutMs?: number;
  persist?: boolean;
}

const DEFAULTS = {
  GROQ_ENDPOINT: 'https://api.groq.com/openai/v1/chat/completions',
  CEREBRAS_ENDPOINT: 'https://api.cerebras.ai/v1/chat/completions',
  OPENAI_EMBEDDING_ENDPOINT: 'https://api.openai.com/v1/embeddings',
  PROVIDER_1: 'groq',
  PROVIDER_2: 'groq',
  PROVIDER_1_MODEL: 'llama-3.1-8b-instant',
  PROVIDER_2_MODEL: 'openai/gpt-oss-20b',
  EMBEDDING_MODEL: 'text-embedding-3-small',
  TIMEOUT_MS: 10000,
  ANSWER_MAX_TOKENS: 400,
};

function endpointFor(provider: string, override?: string): string {
  if (override) return override;
  if (provider === 'cerebras') return DEFAULTS.CEREBRAS_ENDPOINT;
  return DEFAULTS.GROQ_ENDPOINT;
}

function defaultKeyFor(provider: string): string {
  if (provider === 'cerebras') return process.env.CEREBRAS_API_KEY ?? '';
  if (provider === 'openrouter') return process.env.OPENROUTER_API_KEY ?? '';
  return process.env.GROQ_API_KEY ?? '';
}

const ANSWER_SYSTEM_PROMPT =
  'You are a careful, truthful assistant. Answer the user\'s prompt directly in 1-3 sentences. ' +
  'If you do not know, say so. Never fabricate facts. No preamble, no closing remarks.';

function hashPrompt(prompt: string): string {
  return crypto.createHash('sha256').update(prompt).digest('hex').slice(0, 32);
}

function getSupabaseClient() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    '';
  if (!url || !key) return null;
  try {
    return createClient(url, key);
  } catch {
    return null;
  }
}

async function callOpenAIChat(
  endpoint: string,
  apiKey: string,
  model: string,
  prompt: string,
  timeoutMs: number,
): Promise<{ text: string; latency_ms: number }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: ANSWER_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        max_tokens: DEFAULTS.ANSWER_MAX_TOKENS,
        temperature: 0.1,
      }),
      signal: ctrl.signal,
    });
    const latency_ms = Date.now() - start;
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${res.status}: ${body.slice(0, 200)}`);
    }
    const data: any = await res.json();
    let text: string = (data?.choices?.[0]?.message?.content ?? '').trim();
    // Strip Qwen-style chain-of-thought blocks so they don't pollute similarity.
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    text = text.replace(/^<think>[\s\S]*$/i, '').trim(); // unterminated <think>
    return { text, latency_ms };
  } finally {
    clearTimeout(timer);
  }
}

async function queryProvider(
  provider: string,
  endpoint: string,
  apiKey: string,
  model: string,
  prompt: string,
  timeoutMs: number,
): Promise<ProviderAnswer> {
  const start = Date.now();
  try {
    const { text, latency_ms } = await callOpenAIChat(
      endpoint, apiKey, model, prompt, timeoutMs,
    );
    return { provider, model, answer: text, latency_ms };
  } catch (e: any) {
    return {
      provider,
      model,
      answer: '',
      latency_ms: Date.now() - start,
      error: e?.message ?? String(e),
    };
  }
}

async function getEmbedding(
  text: string,
  apiKey: string,
  model: string,
  timeoutMs: number,
): Promise<number[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(DEFAULTS.OPENAI_EMBEDDING_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, input: text }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`embedding ${res.status}: ${body.slice(0, 200)}`);
    }
    const data: any = await res.json();
    const vec: number[] = data?.data?.[0]?.embedding;
    if (!Array.isArray(vec) || vec.length === 0) {
      throw new Error('embedding API returned empty vector');
    }
    return vec;
  } finally {
    clearTimeout(timer);
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`vector length mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function tokenize(s: string): Set<string> {
  const tokens = s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
  return new Set(tokens);
}

function jaccardSimilarity(a: string, b: string): number {
  const sa = tokenize(a);
  const sb = tokenize(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

async function persistComparison(
  promptHash: string,
  result: ComparisonResult,
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  try {
    await supabase.from('cross_llm_comparisons').insert({
      prompt_hash: promptHash,
      provider_1: result.answers[0]?.provider ?? 'unknown',
      provider_2: result.answers[1]?.provider ?? 'unknown',
      model_1: result.answers[0]?.model ?? null,
      model_2: result.answers[1]?.model ?? null,
      agreement_score: result.agreement_score,
      embedding_distance: result.embedding_distance,
      methodology: result.methodology,
      latency_ms: result.latency_ms,
      answer_1_preview: (result.answers[0]?.answer ?? '').slice(0, 500),
      answer_2_preview: (result.answers[1]?.answer ?? '').slice(0, 500),
    });
  } catch (e: any) {
    console.error('[cross-llm] persist failed:', e?.message ?? e);
  }
}

export async function compareAnswers(
  prompt: string,
  opts: CompareOptions = {},
): Promise<ComparisonResult> {
  const start = Date.now();
  const provider1 = opts.provider1 ?? DEFAULTS.PROVIDER_1;
  const provider2 = opts.provider2 ?? DEFAULTS.PROVIDER_2;
  const key1 = opts.provider1ApiKey ?? defaultKeyFor(provider1);
  const key2 = opts.provider2ApiKey ?? defaultKeyFor(provider2);
  const openaiKey = opts.openaiApiKey ?? process.env.OPENAI_API_KEY ?? '';
  const model1 = opts.provider1Model ?? DEFAULTS.PROVIDER_1_MODEL;
  const model2 = opts.provider2Model ?? DEFAULTS.PROVIDER_2_MODEL;
  const endpoint1 = endpointFor(provider1, opts.provider1Endpoint);
  const endpoint2 = endpointFor(provider2, opts.provider2Endpoint);
  const embeddingModel = opts.embeddingModel ?? DEFAULTS.EMBEDDING_MODEL;
  const timeoutMs = opts.timeoutMs ?? DEFAULTS.TIMEOUT_MS;
  const persist = opts.persist !== false;

  const [a1, a2] = await Promise.all([
    queryProvider(provider1, endpoint1, key1, model1, prompt, timeoutMs),
    queryProvider(provider2, endpoint2, key2, model2, prompt, timeoutMs),
  ]);
  const answers = [a1, a2];

  const promptHash = hashPrompt(prompt);

  const bothAnswered = !a1.error && !a2.error && a1.answer && a2.answer;

  let agreement_score = 0;
  let embedding_distance = 1;
  let methodology: 'embedding-cosine' | 'fallback-jaccard' = 'fallback-jaccard';

  if (bothAnswered) {
    let usedEmbedding = false;
    if (openaiKey) {
      try {
        const [v1, v2] = await Promise.all([
          getEmbedding(a1.answer, openaiKey, embeddingModel, timeoutMs),
          getEmbedding(a2.answer, openaiKey, embeddingModel, timeoutMs),
        ]);
        const sim = cosineSimilarity(v1, v2);
        agreement_score = Math.max(0, Math.min(1, sim));
        embedding_distance = Math.max(0, 1 - sim);
        methodology = 'embedding-cosine';
        usedEmbedding = true;
      } catch (e: any) {
        console.error('[cross-llm] embedding fallback:', e?.message ?? e);
      }
    }
    if (!usedEmbedding) {
      const sim = jaccardSimilarity(a1.answer, a2.answer);
      agreement_score = sim;
      embedding_distance = 1 - sim;
      methodology = 'fallback-jaccard';
    }
  } else {
    methodology = 'fallback-jaccard';
    agreement_score = 0;
    embedding_distance = 1;
  }

  const result: ComparisonResult = {
    prompt_hash: promptHash,
    answers,
    agreement_score: Number(agreement_score.toFixed(4)),
    embedding_distance: Number(embedding_distance.toFixed(4)),
    methodology,
    latency_ms: Date.now() - start,
  };

  if (persist) {
    void persistComparison(promptHash, result);
  }
  return result;
}
