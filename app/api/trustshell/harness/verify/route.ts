// app/api/trustshell/harness/verify/route.ts
//
// Verifies a portable harness bundle presented by an agent arriving from
// somewhere else. This is the receiving-host side of the no-lock-in claim: the
// whole point of the bundle is that a host which had no part in issuing it can
// still check everything it asserts.
//
// PURELY ADDITIVE. Grants nothing, gates nothing, touches no existing
// authorization path.
//
// AUDIENCE IS THIS SERVICE'S OWN IDENTITY, never taken from the request — same
// reasoning as the control-proof route. A bundle whose authority was minted for
// somewhere else will verify its integrity here and be refused authority, which
// is the correct answer rather than a failure. That distinction is why the
// response reports per-part outcomes instead of a single boolean.

import { NextResponse } from 'next/server';
import { verifyHarness, type HarnessBundle } from '@/lib/trustshell/identity/harness-bundle';
import { InMemoryNonceStore } from '@/lib/trustshell/identity/nonce-store';

export const dynamic = 'force-dynamic';

/** This host's identity. Bundles bound elsewhere are refused authority here. */
const AUDIENCE = 'trinity:harness-host';

/**
 * Per-instance, like the control-proof route. Module scope is safe: no
 * environment is read and no client is constructed (lib/CLAUDE.md).
 */
const nonceStore = new InMemoryNonceStore();

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'body must be JSON' }, { status: 400 });
  }

  const { bundle } = (body ?? {}) as { bundle?: HarnessBundle };

  // Shape-check first, so a missing field reads as a caller error rather than
  // as a forged signature.
  if (!bundle?.agentDid || !bundle.authority || !bundle.bundleSignature) {
    return NextResponse.json(
      { error: 'bundle must carry { agentDid, authority, bundleSignature }' },
      { status: 400 }
    );
  }

  let result;
  try {
    result = await verifyHarness(bundle, { audience: AUDIENCE, nonceStore });
  } catch (err) {
    return NextResponse.json(
      { error: `could not verify: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 }
    );
  }

  return NextResponse.json(
    {
      valid: result.valid,
      audience: AUDIENCE,
      parts: result.parts,
      grantedCapabilities: result.grantedCapabilities,
      // Stated on every response so a host cannot read a verified bundle as
      // permission to run whatever it names.
      skillNote:
        'skills are pinned by content hash and covered by the bundle signature. ' +
        'This host must compare each hash against what it actually loads — a ' +
        'verified bundle is not an attestation that the loaded code matches.',
    },
    // 200 whenever verification ran, even on an invalid bundle. Read `valid`.
    { status: 200 }
  );
}
