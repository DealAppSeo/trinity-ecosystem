// LIVE-001 — would a live surface actually mint under the secret it is holding?
//
// THREAT. `requireAuditSecret` refusing a weak secret is only half the control.
// The other half is what is SET where the code runs, and the two live surfaces
// have SEPARATE environments (CLAUDE.md § Deployment topology) — so a green
// build, a 200 from the domain and a passing local suite are all compatible
// with a production surface configured wrongly.
//
// ── THE MISTAKE THIS PROBE WAS BUILT AROUND, AND THEN CORRECTED ─────────────
//
// The first draft ranked `abandoned_default` as FAILS OPEN: a surface holding
// the published constant mints receipts anyone can forge. That reading was
// wrong, and live evidence is what caught it — `www` reports exactly that
// status word, which made the difference between "forging receipts right now"
// and "cannot mint at all" load-bearing rather than academic. Executing
// `requireAuditSecret` settles it: the abandoned default is REFUSED, so the
// surface fails closed.
//
// The lesson is now built into the probe rather than written above it. This
// probe does not carry its own opinion about which status words are dangerous.
// It ASKS THE MINTING CODE, by driving `requireAuditSecret` over a
// representative value for each status word. If someone later removes the
// refusal, this probe turns red against live evidence on the next run, with no
// edit here. A hardcoded table would have gone on reporting the old answer.
//
// ── HOW IT RUNS WHERE THE NETWORK IS DENIED ─────────────────────────────────
//
// Both custom domains are proxy-denied to `curl` and to the browser tool from
// an agent session, so this probe SPLITS COLLECTION FROM JUDGEMENT:
//
//   collection  any party with network reach — a human, `pg_net` from Supabase,
//               a CI runner, or an external agent (XAI / Gemini) — fetches
//               `/api/version` and drops the response into
//               `scripts/redteam/evidence/` in the documented shape.
//
//   judgement   this probe, deterministically, here. The collector never gets
//               to say whether something is a finding.
//
// That split is the whole reason an external model can be pointed at this
// safely: it contributes OBSERVATIONS, which are checkable, and never verdicts,
// which are not. See `docs/RED-TEAM-CHARTER.md`.
//
// Evidence carries provenance and expiry. Past MAX_AGE_DAYS it is NOT_CHECKED,
// because a configuration reading from three weeks ago describes a deployment
// that may no longer exist, and stale evidence read as current is how a
// security report becomes fiction.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { compileAndImport } from '../compile.mjs';
import { held, breached, notChecked } from '../harness.mjs';

const EVIDENCE_DIR = 'scripts/redteam/evidence';
const MAX_AGE_DAYS = 14;

/**
 * A representative value for each status word `/api/version` can report, so the
 * minting code itself can be asked what each one means.
 *
 * `ok` deliberately maps to a strong secret: the endpoint never emits a value,
 * a prefix or a length (that is the property `check:config-readiness` protects),
 * so `ok` is a claim by the surface that its secret passes, and this probe can
 * only verify that such a secret would in fact be accepted.
 */
const REPRESENTATIVE = (D) => ({
  ok: 'k7Qw2ZpL9mXvT4aB6nR1sYcE',
  missing: undefined,
  too_short: 'short',
  abandoned_default: D,
});

export default {
  id: 'LIVE-001',
  title: 'Live surfaces: is the deployed audit secret one that would mint?',
  component: 'TrustShell / deployed surfaces',
  severity: 'Critical',
  threat: 'A production surface issues compliance receipts under a secret published in the repository.',

  async run() {
    if (!existsSync(EVIDENCE_DIR)) return notChecked(`no evidence directory at ${EVIDENCE_DIR}`, howToCollect());
    const files = readdirSync(EVIDENCE_DIR).filter((f) => f.startsWith('version-') && f.endsWith('.json'));
    if (files.length === 0) return notChecked(`no version evidence in ${EVIDENCE_DIR}`, howToCollect());

    // Ask the minting code what each status word means, rather than asserting it.
    const c = await compileAndImport(['lib/trustshell/receipt-audit.ts']);
    if (!c.ok) return notChecked(`cannot judge live evidence without the minting code: ${c.reason}`, c.howToRun);
    const { requireAuditSecret, ABANDONED_DEFAULT_SECRET } = c.modules[0];
    const rep = REPRESENTATIVE(String(ABANDONED_DEFAULT_SECRET));

    /** @returns true if a surface reporting this word would actually mint. */
    const wouldMint = (word) => {
      if (!(word in rep)) return null; // unrecognised — not a pass
      try { requireAuditSecret({ TRUSTRAILS_HMAC_SECRET: rep[word] }); return true; } catch { return false; }
    };

    const transcript = [];
    const breaches = [];
    const failClosed = [];
    const unjudged = [];
    const commits = new Map();
    let judged = 0;

    for (const file of files) {
      let ev;
      try { ev = JSON.parse(readFileSync(join(EVIDENCE_DIR, file), 'utf8')); }
      catch (e) { c.cleanup(); return notChecked(`${file} is not valid JSON: ${e.message}`, `re-collect it; schema in ${EVIDENCE_DIR}/README.md`); }

      for (const need of ['surface', 'url', 'collectedAt', 'collectedBy', 'collectedVia', 'statusCode', 'body']) {
        if (ev[need] === undefined) {
          c.cleanup();
          return notChecked(`${file} is missing \`${need}\` — provenance is not optional`, `see ${EVIDENCE_DIR}/README.md`);
        }
      }

      const ageDays = (Date.now() - Date.parse(ev.collectedAt)) / 86_400_000;
      if (!Number.isFinite(ageDays)) { c.cleanup(); return notChecked(`${file}: unparseable collectedAt (${ev.collectedAt})`, 're-collect with an ISO-8601 timestamp'); }
      if (ageDays > MAX_AGE_DAYS) { unjudged.push(`${ev.surface}: collected ${ageDays.toFixed(0)}d ago, limit ${MAX_AGE_DAYS}d`); continue; }

      const cfg = ev.body?.config;
      if (!cfg) { unjudged.push(`${ev.surface}: /api/version returned no \`config\` block`); continue; }

      judged += 1;
      commits.set(ev.surface, `${ev.body.platform ?? '?'}@${ev.body.commit_short ?? '?'}`);
      transcript.push(
        `${ev.surface} — ${ev.url}\n` +
        `    HTTP ${ev.statusCode}, ${ev.body.platform ?? '?'} ${ev.body.environment ?? ''} commit ${ev.body.commit_short ?? '?'}, ready=${cfg.ready}\n` +
        `    collected ${ev.collectedAt} by ${ev.collectedBy} via ${ev.collectedVia}`
      );

      for (const [secret, word] of Object.entries(cfg.secrets ?? {})) {
        const mints = wouldMint(word);
        const known = word === 'abandoned_default';
        transcript.push(`    ${secret} = ${word} -> requireAuditSecret would ${mints === null ? 'NOT RECOGNISE this word' : mints ? 'ACCEPT' : 'REFUSE'} it`);
        if (mints === null) {
          unjudged.push(`${ev.surface}: unrecognised status word ${JSON.stringify(word)} for ${secret} — this probe no longer understands its target`);
        } else if (mints && known) {
          breaches.push(`${ev.surface} (${ev.url}) holds ${secret}=${word} at commit ${ev.body.commit_short ?? '?'} AND the minting path accepts it — every receipt it issues is forgeable by anyone holding the repo`);
        } else if (!mints) {
          failClosed.push(`${ev.surface}: ${secret}=${word} — the mint path REFUSES it, so this surface cannot issue receipts at all`);
        }
      }
    }

    c.cleanup();

    if (judged === 0) return notChecked(`no judgeable evidence: ${unjudged.join('; ') || 'none'}`, howToCollect());

    if (breaches.length > 0) {
      return breached(
        `${breaches.length} live surface(s) would mint under a published secret`,
        [...breaches.map((b) => `  BREACH  ${b}`), '', 'collected evidence:', ...transcript.map((t) => `    ${t}`)].join('\n')
      );
    }

    // Fail-closed is not a breach, and it is not silence either: a surface that
    // cannot mint is a surface whose payment path is DOWN. Reporting that as a
    // clean pass would be the two-outcome collapse in a different costume.
    const divergence = new Set([...commits.values()].map((v) => v.split('@')[1])).size > 1
      ? `  surfaces are on DIFFERENT commits: ${[...commits].map(([s, v]) => `${s}=${v}`).join(', ')} — a finding on one says nothing about the other`
      : null;

    return held(
      `${judged} surface(s) judged; none would mint under a published secret` +
      (failClosed.length ? `. ${failClosed.length} secret(s) FAIL CLOSED — receipt minting is unavailable there, which is an availability finding, not a clean bill` : '') +
      (unjudged.length ? `. ${unjudged.length} not judged` : ''),
      [
        ...transcript,
        ...(failClosed.length ? ['', 'FAILS CLOSED (payment path unavailable on these surfaces):', ...failClosed.map((f) => `    ${f}`)] : []),
        ...(divergence ? ['', divergence] : []),
        ...(unjudged.length ? ['', 'not judged:', ...unjudged.map((u) => `    ${u}`)] : []),
      ].join('\n')
    );
  },
};

function howToCollect() {
  return (
    `write ${EVIDENCE_DIR}/version-<surface>.json in the shape documented in that directory's README. ` +
    'From an agent session the domains are proxy-denied; use Supabase pg_net:  ' +
    "select net.http_get(url := 'https://www.aitrinitysymphony.com/api/version');  then  " +
    'select status_code, content from net._http_response where id = <id>;'
  );
}
