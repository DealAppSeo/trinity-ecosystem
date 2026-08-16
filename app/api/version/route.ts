// app/api/version/route.ts
//
// Which commit is this surface actually running?
//
// WHY THIS EXISTS. On 2026-08-13, PR #22 merged to main and there was no way to
// confirm from outside that either deployment had picked it up. Both custom
// domains returned 200, which proves the sites are UP and says nothing about
// WHAT they are running. The Vercel API was unreachable at the time (the MCP
// gateway was returning 502s), so "did the merge land?" could not be answered
// at all — only inferred, which is the failure mode this codebase keeps logging.
//
// repid-engine already solved this: its `/health` returns `deployed_commit`, and
// that field earned its keep twice the same day — it is how a probe run against
// a still-stale build was caught before it produced a confident wrong answer.
// This is the same idea for the Next app.
//
// The hazard it defeats is specific and not hypothetical: a platform keeps the
// last SUCCESSFUL build serving when a new deploy fails. A green pipeline, a
// 200 from the domain, and a healthy dashboard are all fully compatible with
// running week-old code. Comparing this SHA to origin/main HEAD is the only
// cheap check that distinguishes them.
//
// PUBLIC AND UNAUTHENTICATED, deliberately. A commit SHA for a private repo is
// not a secret — it is already visible to anyone who can see the deployment —
// and requiring a credential would defeat the purpose, since the thing you most
// need this for is checking a deploy from outside. It exposes a fixed set of
// named fields and never enumerates the environment, so a new platform variable
// cannot leak through it by accident.
//
// This surface is served by TWO platforms with separate builds and separate env
// (see CLAUDE.md, "Deployment topology"), so the response names which one
// answered. Confirmed live 2026-08-13:
//   app.aitrinitysymphony.com  -> Railway (x-railway-edge)
//   aitrinitysymphony.com      -> Vercel  (redirects to www)
//   www.aitrinitysymphony.com  -> Vercel

import { NextResponse } from 'next/server';
import { describeConfigReadiness } from '@/lib/trustshell/config-readiness';

// Never prerendered and never cached. A version endpoint that can be served
// from an edge cache can report the previous deployment's SHA, which is worse
// than having no endpoint: it answers confidently and wrongly. `www` was
// observed serving `x-vercel-cache: HIT` on 2026-08-13, so this is a real
// possibility here, not a theoretical one.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Resolve the deployed commit.
 *
 * Each platform injects its own variable at build time. Read as literals rather
 * than by looping over `process.env`, both so the set stays auditable and
 * because this file's siblings on the client side depend on literal reads (see
 * CLAUDE.md on `NEXT_PUBLIC_*` inlining) — keeping one habit avoids the trap.
 */
function resolveDeployment(): { commit: string; platform: string } {
  const vercelSha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (vercelSha) return { commit: vercelSha, platform: 'vercel' };

  const railwaySha = process.env.RAILWAY_GIT_COMMIT_SHA;
  if (railwaySha) return { commit: railwaySha, platform: 'railway' };

  const genericSha = process.env.GIT_COMMIT_SHA;
  if (genericSha) return { commit: genericSha, platform: 'unknown' };

  // 'unknown' rather than a fake value or a silent omission. A caller comparing
  // this against origin/main must be able to tell "not wired up here" apart
  // from "running an old commit" — those need different fixes.
  return { commit: 'unknown', platform: 'unknown' };
}

export async function GET() {
  const { commit, platform } = resolveDeployment();

  return NextResponse.json(
    {
      commit,
      commit_short: commit === 'unknown' ? 'unknown' : commit.slice(0, 7),
      platform,
      // Environment name only — never the values. Vercel reports
      // production/preview/development; Railway reports its environment name.
      environment:
        process.env.VERCEL_ENV ?? process.env.RAILWAY_ENVIRONMENT_NAME ?? 'unknown',
      region: process.env.VERCEL_REGION ?? process.env.RAILWAY_REPLICA_REGION ?? null,
      // Answered-at, not built-at. Do not read this as a build timestamp.
      responded_at: new Date().toISOString(),
      // Required configuration, as STATUS WORDS — never values, never lengths,
      // never an enumeration of the environment. Same rule as the fields above.
      //
      // Added because PR #54 made receipt minting throw without
      // TRUSTRAILS_HMAC_SECRET and then merged with that blocker still open,
      // and there was no way to ask a running surface whether the secret was
      // set. The only check available was to POST a payment to production and
      // see whether it threw, which is not a check. This surface and the other
      // one carry SEPARATE environment variables (CLAUDE.md, deployment
      // topology), so each must be asked in turn — which is why this rides on
      // the endpoint that already names which platform answered.
      config: describeConfigReadiness(process.env),
    },
    {
      status: 200,
      headers: {
        'cache-control': 'no-store, max-age=0, must-revalidate',
      },
    },
  );
}
