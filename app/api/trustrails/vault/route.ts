// app/api/trustrails/vault/route.ts
// TrustShell Sprint — Created March 26 2026 by Gemini

import { NextRequest, NextResponse } from 'next/server';
import { VaultPermissionGate } from '@/lib/trustshell';

export async function POST(req: NextRequest) {
  const { vaultId, agentName, action, amountUSDC } = await req.json();
  const gate  = new VaultPermissionGate();
  const result = await gate.checkAccess({ vaultId, agentName, action, amountUSDC });
  return NextResponse.json(result, { status: result.permitted ? 200 : 403 });
}


export const dynamic = 'force-dynamic';
