// app/api/trustrails/bft/process/route.ts
//
// Drains bft_payment_evaluations: runs the real BFT panel against each queued
// payment and writes the verdict back onto its compliance receipt.
//
// This is the half of the wiring that makes observe mode meaningful. The
// payment path stays fast because it only enqueues; this route does the three
// provider calls and turns a receipt's bft_passed from NULL into a real
// true/false, alongside the vote weights, the comma gap and the veto flag.
//
// Run it from a scheduler (every few minutes is ample) or by hand. It is
// idempotent per row: a row moves pending → evaluated exactly once, and a row
// that fails records why and stays visible rather than vanishing.

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { authenticate, authErrorResponse } from '@/lib/auth';
import { bftEngine } from '@/lib/trust/BFTEngine';

/** Cap per invocation so one call cannot run unbounded provider fan-out. */
const DEFAULT_BATCH = 5;
const MAX_BATCH = 25;
/** After this many failures a row is parked rather than retried forever. */
const MAX_ATTEMPTS = 3;

export async function POST(req: NextRequest) {
  try {
    await authenticate(req);

    const requested = Number(req.nextUrl.searchParams.get('limit') ?? DEFAULT_BATCH);
    const batch = Number.isFinite(requested)
      ? Math.min(Math.max(1, Math.floor(requested)), MAX_BATCH)
      : DEFAULT_BATCH;

    const supabase = getSupabaseAdmin();

    const { data: pending, error: fetchError } = await supabase
      .from('bft_payment_evaluations')
      .select('*')
      .eq('status', 'pending')
      .lt('attempts', MAX_ATTEMPTS)
      .order('created_at', { ascending: true })
      .limit(batch);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    if (!pending?.length) {
      return NextResponse.json({ processed: 0, results: [], message: 'Nothing pending.' });
    }

    const results: Array<Record<string, unknown>> = [];

    for (const row of pending) {
      // Count the attempt before running it. If this invocation dies mid-call,
      // the row still shows it was tried, and MAX_ATTEMPTS eventually parks a
      // row that kills the worker every time.
      await supabase
        .from('bft_payment_evaluations')
        .update({ attempts: (row.attempts ?? 0) + 1 })
        .eq('id', row.id);

      try {
        const verdict = await bftEngine.authorizePayment({
          paymentId: row.payment_id ?? String(row.id),
          agentName: row.agent_name,
          amountUSDC: Number(row.amount_usdc ?? 0),
          recipientAddress: row.recipient_address ?? '(unspecified)',
          purpose: row.purpose ?? '',
          repidScore: Number(row.repid_score ?? 0),
          repidTier: row.repid_tier ?? 'unknown',
          maxWithdrawal: Number(row.max_withdrawal ?? 0),
          humanCustody: Boolean(row.human_custody),
        });

        await supabase
          .from('bft_payment_evaluations')
          .update({
            status: 'evaluated',
            evaluated_at: new Date().toISOString(),
            error: null,
            consensus_reached: verdict.consensus_reached,
            consensus_score: verdict.consensus_score,
            threshold: verdict.threshold,
            comma_gap: verdict.comma_gap,
            comma_severity: verdict.comma_severity,
            pythagorean_veto: verdict.pythagorean_veto_fired,
            hitl_required: verdict.hitl_required,
            votes: verdict.votes,
            proof_hash: verdict.proof_hash,
          })
          .eq('id', row.id);

        // Fill in the receipt. This is the moment bft_passed stops being NULL —
        // the first time in this system's history that the column reflects a
        // vote that actually happened.
        const { error: receiptError } = await supabase
          .from('kya_compliance_receipts')
          .update({
            bft_passed: verdict.consensus_reached,
            bft_consensus_weight: verdict.consensus_score,
            bft_threshold: verdict.threshold,
            bft_votes_for: verdict.votes.filter(v => v.belief > v.disbelief).map(v => v.provider),
            bft_votes_against: verdict.dissenting_providers,
            pythagorean_veto: verdict.pythagorean_veto_fired,
          })
          .eq('receipt_id', row.receipt_id);

        results.push({
          id: row.id,
          receiptId: row.receipt_id,
          status: 'evaluated',
          consensusReached: verdict.consensus_reached,
          consensusScore: Number(verdict.consensus_score.toFixed(4)),
          commaGap: Number(verdict.comma_gap.toFixed(4)),
          pythagoreanVeto: verdict.pythagorean_veto_fired,
          hitlRequired: verdict.hitl_required,
          // Surfaced rather than swallowed: an evaluation that could not reach
          // its receipt has produced a verdict nobody will ever see.
          receiptUpdateError: receiptError?.message ?? null,
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        const attempts = (row.attempts ?? 0) + 1;
        await supabase
          .from('bft_payment_evaluations')
          .update({
            status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
            error: message,
          })
          .eq('id', row.id);

        results.push({ id: row.id, receiptId: row.receipt_id, status: 'error', error: message, attempts });
      }
    }

    return NextResponse.json({ processed: results.length, results });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

/** Queue depth, for monitoring without draining. */
export async function GET(req: NextRequest) {
  try {
    await authenticate(req);
    const supabase = getSupabaseAdmin();

    const counts = await Promise.all(
      (['pending', 'evaluated', 'failed'] as const).map(async status => {
        const { count } = await supabase
          .from('bft_payment_evaluations')
          .select('id', { count: 'exact', head: true })
          .eq('status', status);
        return [status, count ?? 0] as const;
      })
    );

    return NextResponse.json({ queue: Object.fromEntries(counts) });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
