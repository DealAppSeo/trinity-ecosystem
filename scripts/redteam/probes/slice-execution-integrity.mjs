// SLICE-001 — a real side effect happens only through the gate, once, on bound args.
//
// THREAT. The vertical slice (lib/trustshell/runtime) is where the kernel finally
// touches the world: it runs a REAL executor (a file write). Everything the kernel
// proves is worthless if the runtime around it can be made to write a file it was
// never authorized to write, write it twice, or write attacker-swapped bytes. So
// this probe attacks the RUNTIME with a real executor and a real scratch directory
// and judges by what lands on disk:
//
//   HELD        no hostile request wrote a file it should not have; a replayed
//               requestId ran the effect exactly once; swapped args and path
//               traversal wrote nothing; and the one legitimate control DID write.
//   BREACHED    a file exists that should not — an ungranted/ law-forbidden write, a
//               double execution, an arg swap, or a traversal escaped the root.
//   NOT_CHECKED the runtime will not compile/import.
//
// Read/writes only inside an OS temp scratch dir it creates and deletes; no network.

import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compileAndImport } from '../compile.mjs';
import { held, breached, notChecked } from '../harness.mjs';

const FILES = [
  'lib/trustshell/kernel/envelope.ts',
  'lib/trustshell/kernel/constitution.ts',
  'lib/trustshell/kernel/kernel-laws.ts',
  'lib/trustshell/kernel/policy.ts',
  'lib/trustshell/kernel/gate.ts',
  'lib/trustshell/kernel/index.ts',
  'lib/trustshell/runtime/capability.ts',
  'lib/trustshell/runtime/receipt.ts',
  'lib/trustshell/runtime/execute.ts',
  'lib/trustshell/runtime/file-executor.ts',
  'lib/trustshell/runtime/index.ts',
];

const NOW = Date.parse('2026-09-02T12:00:00.000Z');

export default {
  id: 'SLICE-001',
  title: 'A real side effect runs only through the gate, once, on bound arguments',
  component: 'lib/trustshell/runtime — the one real side-effect action path',
  severity: 'High',
  threat:
    'If the runtime around the kernel can be driven to write a file that was never authorized, write it twice for one requestId, act on arguments swapped after authorization, or escape its scratch root, the "one real gated action path" is a fail-open even though the kernel itself is sound.',

  async run() {
    const c = await compileAndImport(FILES, ['lib/trustshell/runtime/index.ts', 'lib/trustshell/kernel/index.ts']);
    if (!c.ok) return notChecked(c.reason, c.howToRun);

    const [RT, K] = c.modules;
    const need = ['runAction', 'InMemoryLedger', 'makeFileWriteExecutor', 'mintCapability', 'resolveGrantedCapabilities', 'hashArgs'];
    const missing = need.filter((n) => RT[n] === undefined);
    if (missing.length || !K.DEFAULT_CONSTITUTION) {
      c.cleanup();
      return notChecked(
        `lib/trustshell/runtime no longer exports ${[...missing, K.DEFAULT_CONSTITUTION ? '' : 'kernel.DEFAULT_CONSTITUTION'].filter(Boolean).join(', ')}`,
        're-point this probe at the current runtime exports'
      );
    }
    const { runAction, InMemoryLedger, makeFileWriteExecutor, mintCapability, resolveGrantedCapabilities, hashArgs } = RT;
    const { DEFAULT_CONSTITUTION } = K;

    const scratch = mkdtempSync(join(tmpdir(), 'slice-001-'));
    const executor = makeFileWriteExecutor(scratch);
    const grant = (cap) => mintCapability({ capability: cap, principal: 'agent://attacker', ttlMs: 3_600_000, now: NOW });

    let n = 0;
    const propose = (args, over = {}) => {
      n += 1;
      return {
        requestId: over.requestId ?? `atk-${n}`,
        principal: 'agent://attacker',
        capability: over.capability ?? 'fs.write',
        tool: 'fs.writeFile',
        targetResource: `file:${args.path}`,
        argsHash: hashArgs(over.bindArgs ?? args),
        dataClassification: 'INTERNAL',
        riskClass: over.riskClass ?? 'low',
        reversibility: 'reversible',
        financialExposure: 0,
        nonce: `n-${n}`,
      };
    };
    const drive = async (proposal, args, grants, ledger) =>
      runAction(
        {
          proposal,
          args,
          constitution: DEFAULT_CONSTITUTION,
          grantedCapabilities: resolveGrantedCapabilities(grants, NOW),
          composition: 'composition:attacker',
          now: NOW,
        },
        executor,
        ledger ?? new InMemoryLedger()
      );

    const breaches = [];
    const transcript = [];
    const fileExists = (p) => existsSync(join(scratch, p));

    // Attack 1: ungranted write.
    {
      const args = { path: 'a1.txt', contents: 'x' };
      await drive(propose(args), args, []);
      transcript.push(`ungranted write -> file exists: ${fileExists('a1.txt')}`);
      if (fileExists('a1.txt')) breaches.push('an UNGRANTED write landed on disk');
    }
    // Attack 2: Kernel-Law capability held as a grant.
    {
      const args = { path: 'a2.txt', contents: 'x' };
      await drive(propose(args, { capability: 'credentials.reveal' }), args, [grant('credentials.reveal')]);
      transcript.push(`law-forbidden write (granted) -> file exists: ${fileExists('a2.txt')}`);
      if (fileExists('a2.txt')) breaches.push('a Kernel-Law-forbidden write landed on disk despite the grant');
    }
    // Attack 3: replay / double execution.
    {
      const ledger = new InMemoryLedger();
      const first = { path: 'a3.txt', contents: 'FIRST' };
      await drive(propose(first, { requestId: 'dup' }), first, [grant('fs.write')], ledger);
      const second = { path: 'a3.txt', contents: 'SECOND' };
      const r2 = await drive(propose(second, { requestId: 'dup' }), second, [grant('fs.write')], ledger);
      const content = fileExists('a3.txt') ? readFileSync(join(scratch, 'a3.txt'), 'utf8') : '(none)';
      transcript.push(`replay same requestId -> executed=${r2.executed}, replay=${r2.replay}, file content='${content}'`);
      if (r2.executed || content !== 'FIRST') breaches.push('a replayed requestId ran the side effect a second time');
    }
    // Attack 4: argument swap after authorization.
    {
      const authorized = { path: 'a4.txt', contents: 'authorized' };
      const swapped = { path: 'a4.txt', contents: 'SWAPPED' };
      await drive(propose(authorized, { bindArgs: authorized }), swapped, [grant('fs.write')]);
      transcript.push(`arg swap -> file exists: ${fileExists('a4.txt')}`);
      if (fileExists('a4.txt')) breaches.push('an arg swap after authorization was executed');
    }
    // Attack 5: path traversal on an authorized write.
    {
      const args = { path: '../a5-escape.txt', contents: 'pwned' };
      await drive(propose(args), args, [grant('fs.write')]);
      const escaped = existsSync(join(scratch, '..', 'a5-escape.txt'));
      transcript.push(`path traversal -> escaped file exists: ${escaped}`);
      if (escaped) {
        rmSync(join(scratch, '..', 'a5-escape.txt'), { force: true });
        breaches.push('a path traversal escaped the scratch root');
      }
    }

    // Control: a legitimate granted write MUST land (else "safe by writing nothing").
    const okArgs = { path: 'control.txt', contents: 'ok' };
    const ctl = await drive(propose(okArgs), okArgs, [grant('fs.write')]);
    const controlWrote = ctl.executed && fileExists('control.txt');
    transcript.push(`control (legit granted write) -> wrote: ${controlWrote}`);

    rmSync(scratch, { recursive: true, force: true });
    c.cleanup();

    if (!controlWrote) {
      return notChecked(
        'the control (a legitimately-granted write) did not land, so a "no breach" result would be vacuous',
        'restore the ALLOW execution path in lib/trustshell/runtime, then re-run npm run check:redteam'
      );
    }
    if (breaches.length > 0) {
      return breached(
        `${breaches.length} real side-effect fail-open(s): a file landed (or ran twice) when it must not`,
        [...breaches.map((b) => `  BREACH  ${b}`), '', 'driven through lib/trustshell/runtime runAction (real file writes):', ...transcript.map((t) => `    ${t}`)].join('\n')
      );
    }
    return held(
      'every hostile write was refused on disk (ungranted, law-forbidden, replay, arg-swap, traversal); the legitimate control wrote once',
      transcript.join('\n')
    );
  },
};
