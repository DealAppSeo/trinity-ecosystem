// LIVE-002 — does a deployed browser bundle ship a usable Supabase key?
//
// THREAT. A Next.js surface inlines its `NEXT_PUBLIC_*` Supabase config into the
// JS bundle. Two things can be wrong with what ships, and they fail in opposite
// directions:
//
//   FAIL OPEN — the bundle ships a `service_role` key (or any key that still
//   authenticates as more than `anon`). That key bypasses RLS and is now in
//   every visitor's browser. Critical.
//
//   FAIL CLOSED — the bundle ships a LEGACY key (`anon`/`service_role` JWT) on a
//   project where legacy keys have been disabled. Every Supabase call the client
//   makes returns 401, so any feature behind it — auth, lead capture, data — is
//   silently dead. Not a leak; an outage. This is the exact root cause of the
//   217-day-dead aitrinitysymphony lead form (`PRIOR-WORK-INDEX.md`), and the
//   antipattern `check:config-readiness`/TF-09 gate elsewhere.
//
// Both matter, and telling them apart is the whole job — which is why this probe
// does not carry an opinion about a key by its shape alone. It reads two
// observed facts from the evidence: the key's decoded claims (is it `anon` or
// `service_role`, legacy JWT or a new `sb_publishable_…`), and the result of a
// LIVE auth test against PostgREST with that exact key. The severity comes from
// the pair, not from either alone — a `service_role` key that tests 401 is dead
// hygiene, an `anon` key that tests 200 is normal, and the two dangerous corners
// are what this reports.
//
// COLLECTION IS SPLIT FROM JUDGEMENT (charter §1). The bundle is proxy-denied
// from an agent session; a collector with reach records the decoded claims and
// the live auth-test status into `scripts/redteam/evidence/bundle-*.json`, and
// this probe applies the policy. The collector never says "this is a finding".
// The raw token is deliberately NOT in the evidence — it is public-by-design for
// `anon` and would trip `check:secrets`; the decoded claims are the observation.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { held, breached, notChecked } from '../harness.mjs';

const EVIDENCE_DIR = 'scripts/redteam/evidence';
const MAX_AGE_DAYS = 30; // a deployment's bundle changes less often than its env

export default {
  id: 'LIVE-002',
  title: 'Deployed browser bundle ships a legacy/disabled or over-privileged Supabase key',
  component: 'TrustShell / deployed surfaces (client bundle)',
  severity: 'Medium',
  threat: 'A shipped Supabase key is either privileged (RLS bypass in the browser) or legacy-disabled (every client call 401s and the feature is silently dead).',

  async run() {
    if (!existsSync(EVIDENCE_DIR)) return notChecked(`no evidence directory at ${EVIDENCE_DIR}`, howToCollect());
    const files = readdirSync(EVIDENCE_DIR).filter((f) => f.startsWith('bundle-') && f.endsWith('.json'));
    if (files.length === 0) return notChecked(`no bundle evidence in ${EVIDENCE_DIR} (bundle-*.json)`, howToCollect());

    const transcript = [];
    const breaches = [];
    const unjudged = [];
    let judged = 0;

    for (const file of files) {
      let ev;
      try { ev = JSON.parse(readFileSync(join(EVIDENCE_DIR, file), 'utf8')); }
      catch (e) { return notChecked(`${file} is not valid JSON: ${e.message}`, `re-collect; schema in ${EVIDENCE_DIR}/README.md`); }

      for (const need of ['surface', 'collectedAt', 'collectedBy', 'collectedVia', 'observations']) {
        if (ev[need] === undefined) return notChecked(`${file} missing \`${need}\` — provenance is not optional`, `see ${EVIDENCE_DIR}/README.md`);
      }
      const ageDays = (Date.now() - Date.parse(ev.collectedAt)) / 86_400_000;
      if (!Number.isFinite(ageDays)) return notChecked(`${file}: unparseable collectedAt`, 're-collect with an ISO-8601 timestamp');
      if (ageDays > MAX_AGE_DAYS) { unjudged.push(`${ev.surface}: collected ${ageDays.toFixed(0)}d ago (limit ${MAX_AGE_DAYS})`); continue; }

      const key = ev.observations?.supabaseKey;
      if (key === undefined) { unjudged.push(`${ev.surface}: evidence has no observations.supabaseKey field`); continue; }

      judged += 1;

      // No key shipped at all is the safe outcome for this probe.
      if (key === null || key.absent === true) {
        transcript.push(`${ev.surface}: no Supabase key found in the checked bundles — safe`);
        continue;
      }

      const role = key.claims?.role ?? '(unknown)';
      const isLegacy = key.format === 'legacy_jwt' || key.isNewPublishableOrSecret === false;
      const auth = ev.observations?.liveAuthTest;
      const authStatus = auth?.statusCode;
      const disabledMarker = typeof auth?.serverMessage === 'string' && /legacy api keys are disabled|disabled on/i.test(auth.serverMessage);

      transcript.push(
        `${ev.surface}: key role=${role} format=${key.format ?? '?'} legacy=${isLegacy} ` +
        `liveAuthTest=${authStatus ?? 'NONE'}${disabledMarker ? ' (disabled)' : ''}`
      );

      // ── the dangerous corner: a privileged key that still works ────────────
      if (role === 'service_role' || role === 'authenticated') {
        if (authStatus === 200) {
          breaches.push(`${ev.surface}: bundle ships a **${role}** key that AUTHENTICATES (live test 200) — RLS-bypassing credential in every visitor's browser. Rotate immediately.`);
        } else {
          breaches.push(`${ev.surface}: bundle ships a **${role}** key (live test ${authStatus ?? 'not run'}). Even if currently disabled, a privileged key must never be in a browser bundle — it authenticates the moment legacy keys are re-enabled.`);
        }
        continue;
      }

      // ── the fail-closed corner: an anon/legacy key that is disabled ────────
      if (isLegacy && (disabledMarker || authStatus === 401)) {
        breaches.push(
          `${ev.surface}: bundle ships a LEGACY ${role} key that the project has DISABLED (live test ${authStatus}${disabledMarker ? ', "legacy keys disabled"' : ''}). ` +
          `Any Supabase call the client makes 401s — the feature behind it is silently dead (same root cause as the aitrinitysymphony lead form). Replace with a current sb_publishable_… key.`
        );
        continue;
      }

      // ── a legacy key that still works: hygiene, fails neither open nor dead ─
      if (isLegacy) {
        breaches.push(`${ev.surface}: bundle ships a LEGACY ${role} key that still authenticates (live test ${authStatus ?? 'not run'}). Migrate to a new publishable key before legacy keys are disabled, or this becomes the dead-integration case with no warning.`);
        continue;
      }

      // A current publishable anon key that works is exactly what should ship.
      transcript.push(`${ev.surface}: ships a current ${role} publishable key (live test ${authStatus ?? 'not run'}) — correct`);
    }

    if (judged === 0) return notChecked(`no judgeable bundle evidence: ${unjudged.join('; ') || 'none'}`, howToCollect());

    if (breaches.length > 0) {
      return breached(
        `${breaches.length} deployed bundle(s) ship a problematic Supabase key`,
        [...breaches.map((b) => `  BREACH  ${b}`), '', 'transcript:', ...transcript.map((t) => `    ${t}`),
         ...(unjudged.length ? ['', 'not judged:', ...unjudged.map((u) => `    ${u}`)] : [])].join('\n')
      );
    }
    return held(
      `${judged} bundle(s) judged; every shipped Supabase key is a current, appropriately-scoped publishable key` + (unjudged.length ? ` (${unjudged.length} not judged)` : ''),
      transcript.join('\n')
    );
  },
};

function howToCollect() {
  return (
    `Fetch the SSR document and its /_next/static/chunks/*.js, extract the Supabase key, decode its JWT claims, ` +
    `and run one live auth test (GET <project>.supabase.co/rest/v1/ with the key). Write the decoded claims + the ` +
    `auth-test status/message — NOT the raw token — to ${EVIDENCE_DIR}/bundle-<surface>.json. From an agent session ` +
    `use pg_net; the domains are curl-denied.`
  );
}
