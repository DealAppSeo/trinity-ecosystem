// lib/trustshell/alerts/digest.ts
//
// Collapse 142,560 agent log rows into something a human can act on.
//
// ZERO IMPORTS so `check:alert-digest` can compile and assert it standalone.
//
// =============================================================================
// WHAT IS ACTUALLY THERE, MEASURED 2026-08-16
// =============================================================================
//
//   142,560 rows in trinity_agent_logs, and the `status` column has held exactly
//   TWO values in its lifetime: 'info' and 'pending'. 'pending' is the COLUMN
//   DEFAULT.
//
// That last fact reframes everything. There is no drained queue and no broken
// consumer — nothing ever set the column, and no delivery pipeline was ever
// built. Reading 'pending' as "queued but undelivered" overstates it: the honest
// reading is "nobody ever wrote a status".
//
// The backlog, by action:
//
//   survivor_alert                40,236   2026-05-14 → today, 3 reporters
//   api_auth_attempt              31,196   2026-08-02 → today
//   substance_gate_degraded       29,791
//   substance_gate_shadow_reject  13,148
//   task_escalated                 9,797
//   escalation_contract            7,231
//   bft_slash                      3,324
//   survivor_missing               3,008
//   main_loop_error                1,525   <- errors, never surfaced
//   HELP_REQUEST                     114   <- agents asking for help, never surfaced
//
// =============================================================================
// WHY A DIGEST AND NOT A DELIVERY LOOP
// =============================================================================
//
// The naive consumer drains the queue and sends 142,560 messages. That is WORSE
// than sending none: it buries the 114 HELP_REQUESTs under 40,236 repetitions of
// one fact, and it trains the recipient to ignore the channel — which is how the
// fleet came to shout for 29 days into a room nobody was in.
//
// So the unit of delivery is a DIGEST: one row per (action, subject, shape),
// carrying how many times it fired, over what window, and from how many distinct
// reporters. Corroboration is signal — three agents independently reporting
// trinity-orch DOWN is stronger evidence than one, and collapsing them to a
// single line without the count would throw that away.
//
// =============================================================================
// CHRONIC IS NOT RESOLVED
// =============================================================================
//
// A condition firing for 29 days must not be downgraded to noise — that is
// exactly how this one got ignored. It must also not re-notify every 3 minutes.
// The rule is: notify on FIRST sight, notify on CHANGE, and otherwise notify at
// most once per heartbeat interval, with the age stated so a reader sees at a
// glance that it is chronic rather than new.
//
// =============================================================================
// PARSE ONLY WHAT HAS BEEN MEASURED
// =============================================================================
//
// `survivor_alert`'s shape was read from real rows. Every other action is grouped
// STRUCTURALLY — by action, agent and a normalised message — rather than through
// a parser invented for a format nobody has looked at. `api_auth_attempt`, for
// instance, carries an empty message entirely; a parser assuming otherwise would
// silently produce empty subjects and look like it worked.

export interface AlertRow {
  id: number;
  action: string | null;
  agent: string | null;
  message: string | null;
  createdAt: string;
}

export interface Digest {
  key: string;
  action: string;
  /** Who the alert is ABOUT, when that is recoverable. Distinct from the reporter. */
  subject: string | null;
  /** Normalised message; the thing that makes repeats collapse. */
  shape: string;
  count: number;
  /** Distinct agents that reported it. Corroboration, not noise. */
  reporters: string[];
  firstSeen: string;
  lastSeen: string;
  /** One real message, verbatim, so the digest never replaces the evidence. */
  sample: string;
}

/**
 * Strip the parts of a message that change on every repeat.
 *
 * Without this, "Time Down: 42314 minutes" and "Time Down: 42317 minutes" are
 * two distinct alerts, and 40,236 rows collapse to 40,236 digests — a consumer
 * that achieves nothing while appearing to work.
 */
export function normalizeShape(message: string): string {
  return message
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/\b\d[\d,._]*\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

/**
 * Who the alert is about, for the one shape that has been measured.
 *
 * `🚨 SURVIVOR ALERT: trinity-orch is DOWN` → `trinity-orch`.
 *
 * Returns null for everything else rather than guessing. A wrong subject is
 * worse than no subject: it routes a human to the wrong agent, which is the
 * name-matching failure this repo has already paid for twice.
 */
export function subjectOf(action: string, message: string): string | null {
  if (action === 'survivor_alert') {
    const m = /SURVIVOR ALERT:\s*([\w-]+)\s+is\s+(\w+)/i.exec(message);
    return m ? m[1] : null;
  }
  return null;
}

export function digestRows(rows: AlertRow[]): Digest[] {
  const byKey = new Map<string, Digest>();
  for (const r of rows) {
    const action = r.action ?? '(none)';
    const message = r.message ?? '';
    const shape = normalizeShape(message);
    const subject = subjectOf(action, message);
    const key = `${action}|${subject ?? ''}|${shape}`;

    const d = byKey.get(key);
    if (!d) {
      byKey.set(key, {
        key, action, subject, shape,
        count: 1,
        reporters: r.agent ? [r.agent] : [],
        firstSeen: r.createdAt,
        lastSeen: r.createdAt,
        sample: message,
      });
      continue;
    }
    d.count += 1;
    if (r.agent && !d.reporters.includes(r.agent)) d.reporters.push(r.agent);
    if (r.createdAt < d.firstSeen) d.firstSeen = r.createdAt;
    if (r.createdAt > d.lastSeen) d.lastSeen = r.createdAt;
  }
  for (const d of byKey.values()) d.reporters.sort();
  // Most recent first: a thing still happening outranks a thing that stopped.
  return [...byKey.values()].sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1));
}

export type Decision = 'DELIVER_FIRST' | 'DELIVER_HEARTBEAT' | 'SUPPRESS_RECENT' | 'SUPPRESS_STALE';

export interface Policy {
  /** How often a chronic condition may re-notify. */
  heartbeatHours: number;
  /**
   * A condition whose last occurrence is older than this is history, not an
   * alert. It is still digested and still visible; it just does not page.
   */
  staleAfterDays: number;
}

export const DEFAULT_POLICY: Policy = { heartbeatHours: 24, staleAfterDays: 7 };

/**
 * Should this digest notify now?
 *
 * `lastNotifiedAt` is null when it has never been notified — which, for every
 * digest in this database today, it is.
 */
export function decide(
  d: Digest,
  lastNotifiedAt: string | null,
  now: string,
  policy: Policy = DEFAULT_POLICY
): Decision {
  const nowMs = Date.parse(now);
  const lastSeenMs = Date.parse(d.lastSeen);
  const ageDays = (nowMs - lastSeenMs) / 86_400_000;

  // Stale is checked BEFORE first-notice. A condition that last fired in March
  // must not page anybody in August merely because it was never notified — the
  // backlog is full of exactly that, and delivering it would bury what is live.
  if (ageDays > policy.staleAfterDays) return 'SUPPRESS_STALE';
  if (lastNotifiedAt === null) return 'DELIVER_FIRST';

  const sinceNotifiedH = (nowMs - Date.parse(lastNotifiedAt)) / 3_600_000;
  return sinceNotifiedH >= policy.heartbeatHours ? 'DELIVER_HEARTBEAT' : 'SUPPRESS_RECENT';
}

export function willNotify(dec: Decision): boolean {
  return dec === 'DELIVER_FIRST' || dec === 'DELIVER_HEARTBEAT';
}

/** Age of the condition in whole days, for stating chronicity plainly. */
export function chronicDays(d: Digest, now: string): number {
  return Math.floor((Date.parse(now) - Date.parse(d.firstSeen)) / 86_400_000);
}

/**
 * One line a human can read.
 *
 * States the count and the age because a digest that hides how long something
 * has been broken reads as new — and this fleet has been down for 29 days.
 */
export function renderLine(d: Digest, now: string): string {
  const days = chronicDays(d, now);
  const who = d.subject ? ` ${d.subject}` : '';
  const corroboration = d.reporters.length > 1 ? `, ${d.reporters.length} reporters` : '';
  const age = days > 0 ? `, ongoing ${days}d` : '';
  return `${d.action}${who} — ${d.count}×${corroboration}${age} — ${d.sample.split('\n')[0].slice(0, 90)}`;
}
