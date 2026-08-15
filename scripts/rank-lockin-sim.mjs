#!/usr/bin/env node
// Does rank-based role assignment lock newcomers out?
//
// CEILING BEFORE SIMULATION, per this repo's own rule. The question is not
// "what happens" but "under what condition is promotion IMPOSSIBLE" — that is
// arithmetic, and it should be derived before any traffic is generated.
//
// THE MODEL, stated so its assumptions are attackable:
//   - one Generator slot, assigned to argmax(RepID) each round (Grok's rule)
//   - every agent in any role can earn RepID from verified outcomes
//   - LEAD_YIELD  = RepID gained per verified outcome while holding the lead role
//   - r           = (yield in a non-lead role) / (yield in the lead role)
//   - incumbents and newcomers succeed at the SAME rate p, so any lock-in
//     observed is structural, not a capability difference. That is the point:
//     if an equally-good newcomer cannot climb, the rank rule is the cause.
//   - EWMA recency decay, alpha from the measured harness (0.06)
//
// r is the whole ballgame. r = 0 means RepID accrues only in the lead role,
// which is a strict deadlock: the newcomer can never overtake because it can
// never earn. r = 1 means the role confers no earning advantage at all, and the
// rank rule is decorative. The real system is somewhere between, and NOBODY HAS
// MEASURED WHERE — which is the finding.

const ALPHA = 0.06;          // measured EWMA weight, harness Sprint Y
const ROUNDS = 5000;
const INCUMBENTS = 4;
const P_SUCCESS = 0.8;       // identical for everyone, deliberately

function run(r, newcomerStart = 0, seed = 1) {
  // Deterministic LCG so runs are reproducible without a dependency.
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);

  // Incumbents warm-started high; newcomer joins cold.
  const rep = Array.from({ length: INCUMBENTS }, () => 0.75);
  rep.push(newcomerStart);
  const NEW = rep.length - 1;

  let firstLead = -1;
  for (let t = 0; t < ROUNDS; t += 1) {
    const lead = rep.indexOf(Math.max(...rep));
    if (lead === NEW && firstLead < 0) firstLead = t;

    for (let i = 0; i < rep.length; i += 1) {
      const success = rnd() < P_SUCCESS ? 1 : 0;
      const yieldScale = i === lead ? 1 : r;
      // EWMA toward the observed outcome, scaled by how much this role's work
      // counts. A role that yields nothing moves the score not at all.
      rep[i] = rep[i] + ALPHA * yieldScale * (success - rep[i]);
    }
  }
  return { firstLead, finalNewcomer: rep[NEW], finalLead: Math.max(...rep) };
}

console.log('Rank-based role assignment: can an EQUALLY GOOD newcomer ever lead?\n');
console.log('  r = RepID yield in a non-lead role, as a fraction of lead-role yield');
console.log(`  ${INCUMBENTS} incumbents warm-started at 0.75, newcomer at 0.00`);
console.log(`  identical success rate p=${P_SUCCESS} for everyone, alpha=${ALPHA}, ${ROUNDS} rounds\n`);
console.log('    r      first round leading    newcomer RepID    verdict');
console.log('  ' + '─'.repeat(66));

for (const r of [0, 0.05, 0.1, 0.25, 0.5, 0.75, 1.0]) {
  const out = run(r);
  const verdict = out.firstLead < 0 ? 'NEVER LEADS — locked out' : `promoted @ round ${out.firstLead}`;
  console.log(
    `  ${String(r).padEnd(6)} ${String(out.firstLead < 0 ? '—' : out.firstLead).padEnd(21)} ` +
    `${out.finalNewcomer.toFixed(4).padEnd(17)} ${verdict}`
  );
}

console.log('\n  Sensitivity: does a warm start rescue a locked-out newcomer at r=0?');
for (const start of [0, 0.5, 0.74, 0.7499]) {
  const out = run(0, start);
  console.log(
    `    newcomer starts at ${String(start).padEnd(7)} -> ` +
    (out.firstLead < 0 ? 'still never leads' : `leads @ round ${out.firstLead}`)
  );
}

console.log('\n  What this does and does not show:');
console.log('    - it is arithmetic about a SELECTION RULE, not a measurement of our fleet');
console.log('    - r is the parameter that decides everything, and r is UNMEASURED here');
console.log('    - success rates are identical by construction, so any lock-out is');
console.log('      caused by the rank rule alone and not by the newcomer being worse');
