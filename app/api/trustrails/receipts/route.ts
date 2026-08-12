// app/api/trustrails/receipts/route.ts
// TrustShell Sprint — Created March 26 2026 by Gemini
//
// The receipt feed. Previously `select('*')` and unauthenticated, so every
// column of kya_compliance_receipts reached any caller — including
// `recipient_address`, which the feed does not render and has no reason to
// hand out. app/api/CLAUDE.md is explicit about this: these routes hold the
// service key, so whatever they return is returned with full table access.
//
// Columns below are exactly what LiveReceiptFeed renders, plus the settlement
// and consensus state added on this branch so the feed can show what actually
// happened rather than implying success.

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { authenticate, authErrorResponse } from '@/lib/auth';

const FEED_COLUMNS = [
  'receipt_id',
  'agent_name',
  'agent_repid_score',
  'payment_amount_usdc',
  'bft_passed',
  'solana_tx_hash',
  'fireblocks_preauth_id',
  'created_at',
  // Added with the integrity fixes: a receipt can be simulated, submitted or
  // confirmed, and bft_passed can be NULL for "not evaluated". The feed needs
  // these to avoid rendering all three as the same green tick.
  'tx_verification_status',
  'on_chain_verified',
].join(', ');

export async function GET(req: NextRequest) {
  try {
    await authenticate(req);

    const { data, error } = await getSupabaseAdmin()
      .from('kya_compliance_receipts')
      .select(FEED_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ receipts: data ?? [] });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
