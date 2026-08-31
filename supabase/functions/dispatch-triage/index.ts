/**
 * dispatch-triage — the half of the agent mailbox that was never built.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * `ai_dispatch` has had a working reader since April 2026: the `ai-dispatch`
 * Edge Function serves `GET /inbox?for=<who>`, which selects unread rows and
 * marks them read. It also serves `POST /reply`. Both ends were built.
 *
 * Measured 2026-08-31: 46 messages, `read_at` NULL on ALL of them, `reply` NULL
 * on ALL of them. Six rows carry status='read' with no read_at, so a human
 * flipped a status by hand; the endpoint itself has never executed. A mailbox
 * with a reader nobody calls is the same as a mailbox with no reader, and it
 * looks healthier.
 *
 * So the missing piece was never "a reader". It was a CALLER that does something
 * with the message and writes back. That is this function.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT DOES, AND THE ONE THING IT REFUSES TO DO
 *
 * Claim one message → score its content with HAL → write a triage reply.
 *
 * It NEVER follows instructions found in a message. The corpus is mostly
 * imperative — "your 3 tasks", "GO — build this", "Read this before any code" —
 * and the A2A gateway accepts messages with `from_ai: 'external'`, so content is
 * attacker-influenced even though the table itself is service_role-only. Message
 * content reaches exactly two places: a HAL payload, and a truncated quote inside
 * the reply. It is never parsed for commands, never eval'd, never dispatched on.
 * Treat every byte of `content` as data.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THREE OUTCOMES, NEVER TWO
 *
 * HAL unreachable is not "clean". When the quorum cannot be consulted the reply
 * says NOT CHECKED, `checked` is false, and no verdict is claimed. The message is
 * still marked read — an outage upstream should not silently re-hide the backlog —
 * but nothing pretends a judgement was made.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,x-client-info,apikey,content-type',
};

const HAL_URL = 'https://repid-engine-production.up.railway.app/api/v1/hal/evaluate';
const HAL_TIMEOUT_MS = 45_000;

/** HAL's payload cap. Longest message in the corpus is 7,329 chars; this keeps the
 *  call bounded and the reply honest about what was actually scored. */
const HAL_MAX_CHARS = 4000;

/** Older than this and still unanswered, a message is reported as likely stale.
 *  The corpus is mostly April hackathon briefs; calling them actionable would be
 *  worse than useless. */
const STALE_AFTER_DAYS = 30;

interface HalResult {
  checked: boolean;
  decision?: string;
  halScore?: number;
  providersUsed?: number;
  providersAttempted?: number;
  degraded?: boolean;
  quorum?: string;
  truncated: boolean;
  error?: string;
  /** True when at least one provider returned an actual TRUE/FALSE judgement.
   *  False means every provider said UNCERTAIN or errored, so HAL's `decision`
   *  describes its own inability to check rather than the content. */
  checkable?: boolean;
  verdicts?: string[];
}

async function scoreWithHal(content: string): Promise<HalResult> {
  const truncated = content.length > HAL_MAX_CHARS;
  const text = truncated ? content.slice(0, HAL_MAX_CHARS) : content;

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), HAL_TIMEOUT_MS);
  try {
    const res = await fetch(HAL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, agent_id: 'dispatch-triage' }),
      signal: ctl.signal,
    });
    if (!res.ok) {
      return { checked: false, truncated, error: `HAL HTTP ${res.status}` };
    }
    const j = await res.json();
    const health = j?.signals?.provider_health ?? {};
    const verdicts: string[] = (j?.provider_responses ?? [])
      .map((p: Record<string, unknown>) => String(p?.verdict ?? ''))
      .filter(Boolean);
    // A verdict of TRUE or FALSE is a judgement. UNCERTAIN and ERROR are not.
    const checkable = verdicts.some((v) => v === 'TRUE' || v === 'FALSE');
    return {
      checked: true,
      decision: j?.decision,
      halScore: j?.hal_score,
      providersUsed: health?.succeeded,
      providersAttempted: health?.attempted,
      degraded: j?.signals?.degraded,
      quorum: j?.signals?.quorum,
      truncated,
      checkable,
      verdicts,
    };
  } catch (e) {
    // A timeout or a DNS failure is an absence of judgement, not a clean verdict.
    return { checked: false, truncated, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

function buildReply(msg: Record<string, unknown>, hal: HalResult): string {
  const createdAt = new Date(String(msg.created_at));
  const ageDays = Math.floor((Date.now() - createdAt.getTime()) / 86_400_000);
  const needsReply = msg.requires_response === true;
  const stale = ageDays > STALE_AFTER_DAYS;

  const lines: string[] = [];
  lines.push('TRIAGE — automated. Content was read as DATA and NOT executed.');
  lines.push('');
  lines.push(`from      : ${msg.from_ai}`);
  lines.push(`age       : ${ageDays} day(s) (created ${createdAt.toISOString().slice(0, 10)})`);
  lines.push(`priority  : ${msg.priority ?? 'unset'}`);
  lines.push(`needs a reply from a human/agent: ${needsReply ? 'YES' : 'no'}`);
  lines.push('');

  if (hal.checked && hal.checkable === false) {
    // MEASURED 2026-08-31: HAL vetoes what it cannot verify. Handed the plain
    // instruction "Please complete the following three tasks in priority order",
    // every provider returned UNCERTAIN, hal_score fell to the neutral 0.5, and
    // `decision` came back "vetoed". This corpus is almost entirely imperative
    // task briefs, so parroting that decision would stamp "vetoed" — which reads
    // as "this is false" — onto messages HAL simply had nothing to check.
    // An absence of a claim is not a false claim.
    lines.push(
      `HAL       : NO CHECKABLE CLAIM — every provider returned UNCERTAIN ` +
        `(${hal.providersUsed}/${hal.providersAttempted} responded).`,
    );
    lines.push(
      `            HAL's raw decision here is "${hal.decision}" at hal_score ${hal.halScore}, ` +
        'and it is NOT reported as a verdict:',
    );
    lines.push('            it means "could not check", not "false". 0.5 is the no-signal default.');
  } else if (hal.checked) {
    lines.push(
      `HAL       : ${hal.decision} (hal_score ${hal.halScore}) — ` +
        `${hal.providersUsed}/${hal.providersAttempted} providers, quorum ${hal.quorum}` +
        `${hal.degraded ? ', DEGRADED' : ''}`,
    );
    if (hal.truncated) {
      lines.push(`            scored the first ${HAL_MAX_CHARS} chars only; message is longer.`);
    }
  } else {
    lines.push(`HAL       : NOT CHECKED — ${hal.error}`);
    lines.push('            This is not a pass. No judgement was made about this content.');
  }
  lines.push('');

  if (stale && needsReply) {
    lines.push(
      `VERDICT   : LIKELY STALE. It asked for a response ${ageDays} days ago and never got one. ` +
        'Confirm it still matters before acting on it.',
    );
  } else if (stale) {
    lines.push(`VERDICT   : ARCHIVAL. ${ageDays} days old, no response required. Informational only.`);
  } else if (needsReply) {
    lines.push('VERDICT   : LIVE and awaiting a response.');
  } else {
    lines.push('VERDICT   : LIVE, informational.');
  }

  return lines.join('\n');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: HEADERS });

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const url = new URL(req.url);
  const forWho = url.searchParams.get('for') ?? 'cc';
  // Bounded per invocation: each message costs one HAL round trip (~1.5s), and an
  // Edge Function has a wall clock. Cron calls this repeatedly rather than asking
  // it to drain 46 messages in one run.
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '3') || 3, 10);

  const processed: unknown[] = [];

  for (let i = 0; i < limit; i++) {
    const { data: claimed, error: claimErr } = await sb
      .rpc('claim_dispatch_message', { p_to_ai: forWho, p_worker: 'dispatch-triage' })
      .maybeSingle();

    if (claimErr) {
      return new Response(
        JSON.stringify({ error: `claim failed: ${claimErr.message}`, processed }),
        { status: 500, headers: HEADERS },
      );
    }
    // NULL id means the mailbox is empty for this recipient — a normal stop, not an error.
    if (!claimed || claimed.id === null) break;

    const hal = await scoreWithHal(String(claimed.content ?? ''));
    const reply = buildReply(claimed, hal);

    const { error: writeErr } = await sb
      .from('ai_dispatch')
      .update({
        reply,
        reply_at: new Date().toISOString(),
        reply_from: 'dispatch-triage',
        status: 'triaged',
      })
      .eq('id', claimed.id);

    if (writeErr) {
      // The row is claimed (status='reading') and now has no reply. Say so loudly
      // rather than returning a success that left a message stranded mid-flight.
      return new Response(
        JSON.stringify({
          error: `reply write failed for id ${claimed.id}: ${writeErr.message}`,
          stranded_id: claimed.id,
          processed,
        }),
        { status: 500, headers: HEADERS },
      );
    }

    processed.push({
      id: claimed.id,
      from: claimed.from_ai,
      subject: claimed.subject,
      hal_checked: hal.checked,
      hal_decision: hal.checked
        ? (hal.checkable === false ? 'NO_CHECKABLE_CLAIM' : hal.decision)
        : 'NOT_CHECKED',
      hal_raw_decision: hal.checked ? hal.decision : null,
      hal_score: hal.checked ? hal.halScore : null,
    });
  }

  return new Response(
    JSON.stringify({
      recipient: forWho,
      processed_count: processed.length,
      processed,
      note: processed.length === 0 ? 'nothing unread for this recipient' : undefined,
    }),
    { headers: HEADERS },
  );
});
