// app/api/trustrails/vault/route.ts
// TrustShell Sprint — Created March 26 2026 by Gemini
//
// Evaluates whether an agent may access a vault. This is a decision oracle
// rather than a write, but unauthenticated it let anyone enumerate which agents
// hold vault access, at what RepID, and where the limits sit — by probing with
// candidate agent names and amounts. It now requires an authenticated
// principal.
//
// Note the access decision itself still runs through VaultPermissionGate, whose
// BFT step is a placeholder that reports `evaluated: false` (see
// lib/trustshell/BFTAuthorizer.ts). Consensus is NOT CHECKED on this path; the
// RepID, custody and limit checks are real.

import { NextRequest, NextResponse } from 'next/server';
import { VaultPermissionGate } from '@/lib/trustshell';
import { authenticate, authErrorResponse } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    await authenticate(req);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Expected a JSON object body.' }, { status: 400 });
    }

    const { vaultId, agentName, action, amountUSDC } = body as Record<string, unknown>;

    if (typeof vaultId !== 'string' || typeof agentName !== 'string' || typeof action !== 'string') {
      return NextResponse.json(
        { error: 'vaultId, agentName and action are required strings.' },
        { status: 400 }
      );
    }
    if (amountUSDC !== undefined && (typeof amountUSDC !== 'number' || !Number.isFinite(amountUSDC))) {
      return NextResponse.json({ error: 'amountUSDC must be a finite number.' }, { status: 400 });
    }

    const gate = new VaultPermissionGate();
    const result = await gate.checkAccess({
      vaultId,
      agentName,
      action: action as never,
      amountUSDC: amountUSDC as number,
    });

    return NextResponse.json(result, { status: result.permitted ? 200 : 403 });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
