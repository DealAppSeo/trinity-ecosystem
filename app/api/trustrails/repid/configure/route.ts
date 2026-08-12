// app/api/trustrails/repid/configure/route.ts
// TrustShell Sprint — Created March 26 2026 by Gemini
//
// Reads and writes the RepID scoring weights for an institution. These decide
// how an agent's reputation is computed, and therefore which agents clear the
// payment and vault thresholds — so writing them is an operator action, not an
// anonymous one. It previously accepted an institutionId and arbitrary weights
// with no authentication at all.
//
// Constructing RepIDCalculator at module scope is safe here: its Supabase
// client is a lazy getter, not a field initialiser (see lib/CLAUDE.md).

import { NextRequest, NextResponse } from 'next/server';
import { RepIDCalculator, type RepIDWeights } from '@/lib/trustshell/RepIDConfig';
import { authenticate, authorizeInstitution, authErrorResponse } from '@/lib/auth';

const calc = new RepIDCalculator();

const WEIGHT_KEYS = [
  'bftAccuracy',
  'veritasCatchRate',
  'x402SuccessRate',
  'latencyOpportunity',
  'humanCustodyScore',
] as const;

/**
 * Weights must be a complete set of finite numbers in [0,1] summing to ~1.
 *
 * A partial or unnormalised set silently rescales every agent's RepID, which
 * moves the payment and vault thresholds without anything reporting that the
 * scoring basis changed.
 */
function validateWeights(input: unknown): { weights: RepIDWeights } | { error: string } {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { error: 'weights must be an object.' };
  }
  const record = input as Record<string, unknown>;

  const unknownKeys = Object.keys(record).filter((k) => !(WEIGHT_KEYS as readonly string[]).includes(k));
  if (unknownKeys.length) {
    return { error: `Unknown weight keys: ${unknownKeys.join(', ')}.` };
  }

  const out = {} as Record<string, number>;
  for (const key of WEIGHT_KEYS) {
    const value = record[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
      return { error: `Weight '${key}' must be a finite number between 0 and 1.` };
    }
    out[key] = value;
  }

  const sum = WEIGHT_KEYS.reduce((acc, k) => acc + out[k], 0);
  if (Math.abs(sum - 1) > 0.001) {
    return { error: `Weights must sum to 1.0 (got ${sum.toFixed(4)}).` };
  }

  return { weights: out as unknown as RepIDWeights };
}

export async function GET(req: NextRequest) {
  try {
    const actor = await authenticate(req);
    const institutionId = req.nextUrl.searchParams.get('institution') || 'default';
    await authorizeInstitution(actor, institutionId, 'viewer');

    const weights = await calc.getInstitutionWeights(institutionId);
    return NextResponse.json({ institutionId, weights });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await authenticate(req);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Expected a JSON object body.' }, { status: 400 });
    }

    const { institutionId, weights } = body as { institutionId?: unknown; weights?: unknown };
    if (typeof institutionId !== 'string' || !institutionId) {
      return NextResponse.json({ error: 'institutionId is required.' }, { status: 400 });
    }

    await authorizeInstitution(actor, institutionId, 'operator');

    const validated = validateWeights(weights);
    if ('error' in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    await calc.updateInstitutionWeights(institutionId, validated.weights);

    // Recompute one known agent so the caller can see the effect of the change
    // immediately. The metrics here are illustrative sample inputs, not
    // measurements — labelled so nobody reads the output as live telemetry.
    const sample = await calc.calculate(
      'SOPHIA',
      { bftAccuracy: 94, veritasCatchRate: 97, x402SuccessRate: 100, latencyMs: 180, humanCustody: true },
      institutionId
    );

    return NextResponse.json({
      message: `Weights updated for ${institutionId}`,
      updatedBy: actor.label,
      weights: validated.weights,
      preview: {
        note: 'Recomputed from fixed sample metrics, not live agent telemetry.',
        agent: 'SOPHIA',
        result: sample,
      },
    });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
