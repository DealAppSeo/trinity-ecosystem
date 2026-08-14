// app/api/mcp/fleet/route.ts — MCP Streamable HTTP endpoint for fleet discovery.
//
// Transport only. Auth, parse, dispatch, respond — all protocol semantics live
// in lib/mcp/server.ts so they can be exercised without a server running.
//
// JSON responses only, no SSE. The spec permits a server to answer a POSTed
// request with `application/json`, and every tool here returns in one shot;
// an SSE stream would add a connection lifecycle with nothing to put on it.
// Revisit if a long-running tool (a live probe sweep) is ever added.
//
// AUTHENTICATED, unlike /api/version. Fleet topology is not a commit SHA: node
// ids, regions, models, branch names and capability flags together describe
// where the work runs and what it can do. Both principals in lib/auth are
// accepted — a user bearer token for humans and agents acting as a user, and
// x-internal-secret for node-to-node calls. Write tools are service-only, and
// that is enforced in lib/mcp/fleet.ts rather than here, so it holds for any
// future transport.

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { authenticate, authErrorResponse } from '@/lib/auth';
import { RPC, type RpcRequest, envelopeError, fail } from '@/lib/mcp/jsonrpc';
import { PREFERRED_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS, handleRpc } from '@/lib/mcp/server';
import { supabaseFleetSource } from '@/lib/mcp/fleet';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = { 'cache-control': 'no-store, max-age=0, must-revalidate' };

/**
 * Reject cross-origin browser callers.
 *
 * The Streamable HTTP spec calls this out specifically: an MCP endpoint that
 * does not validate Origin is a DNS-rebinding target, because a page the user
 * visits can POST to it with the user's cookies. We hold the service key here,
 * so the blast radius is the whole database.
 *
 * Absent Origin is allowed: non-browser clients (the point of this endpoint)
 * do not send one, and browsers always do on cross-origin requests.
 */
function originRejected(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;

  const allowed = new Set(
    (process.env.MCP_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  return !allowed.has(origin);
}

export async function POST(req: NextRequest) {
  try {
    if (originRejected(req)) {
      return NextResponse.json(
        { error: 'Origin not allowed.' },
        { status: 403, headers: NO_STORE }
      );
    }

    const actor = await authenticate(req);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(fail(null, RPC.PARSE_ERROR, 'Request body is not valid JSON.'), {
        status: 400,
        headers: NO_STORE,
      });
    }

    // Batches were removed from the spec in 2025-06-18. Say so explicitly
    // rather than failing with a shape error that reads like a bug.
    if (Array.isArray(body)) {
      return NextResponse.json(
        fail(null, RPC.INVALID_REQUEST, 'Batched requests are not supported; send one message per request.'),
        { status: 400, headers: NO_STORE }
      );
    }

    const shapeError = envelopeError(body);
    if (shapeError) {
      return NextResponse.json(fail(null, RPC.INVALID_REQUEST, shapeError), {
        status: 400,
        headers: NO_STORE,
      });
    }

    const message = body as RpcRequest;

    const response = await handleRpc(message, {
      source: supabaseFleetSource(getSupabaseAdmin),
      principal: actor.type,
      now: new Date(),
    });

    // Notifications get 202 with no body — returning a JSON-RPC response to
    // one is an interop bug, not a harmless extra.
    if (response === null) {
      return new NextResponse(null, { status: 202, headers: NO_STORE });
    }

    return NextResponse.json(response, {
      status: 200,
      headers: {
        ...NO_STORE,
        'mcp-protocol-version': negotiatedHeader(req),
      },
    });
  } catch (e) {
    const authResponse = authErrorResponse(e);
    if (authResponse) return authResponse;

    const detail = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json(fail(null, RPC.INTERNAL_ERROR, `Unexpected error: ${detail}`), {
      status: 500,
      headers: NO_STORE,
    });
  }
}

/** Echo the client's protocol version when we speak it, else our preferred. */
function negotiatedHeader(req: NextRequest): string {
  const requested = req.headers.get('mcp-protocol-version');
  return requested && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
    ? requested
    : PREFERRED_PROTOCOL_VERSION;
}

/**
 * GET is where a client opens the server-initiated SSE stream. We have nothing
 * to push, and the spec's prescribed way to say that is 405 — which is a
 * supported answer, not a failure.
 */
export async function GET() {
  return NextResponse.json(
    {
      error: 'This endpoint does not provide a server-initiated SSE stream. POST JSON-RPC instead.',
      server: 'trinity-fleet',
      protocol_versions: SUPPORTED_PROTOCOL_VERSIONS,
    },
    { status: 405, headers: { ...NO_STORE, allow: 'POST' } }
  );
}
