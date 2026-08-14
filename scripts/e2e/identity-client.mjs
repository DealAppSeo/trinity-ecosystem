// scripts/e2e/identity-client.mjs
//
// Compiles lib/trustshell/identity into a temp directory and hands the E2E
// suite a real client for minting control proofs.
//
// WHY COMPILE RATHER THAN STUB. The point of the E2E run is that the proof
// crossing the wire was produced by the same code a real holder would run —
// real Ed25519, real Merkle paths, real canonical encodings. A hand-written
// fixture would only prove the route parses whatever this file happens to emit,
// which is the mistake the postgrest-stub notes call out: a stub validated
// against my idea of the format only confirms my idea of the format.
//
// Compiled INTO the repo, not /tmp, so `require('bs58')` resolves upward into
// node_modules — Node's resolver walks parents from the file's own location.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from '../local-tsc.mjs';

const MODULES = [
  'did.ts',
  'disclosure.ts',
  'identity.ts',
  'proof-provider.ts',
  'control-proof.ts',
  'capability.ts',
  'nonce-store.ts',
];

/**
 * @returns {Promise<{ mods: Record<string, any>, dispose: () => void }>}
 */
export async function loadIdentity() {
  const outDir = mkdtempSync(join(process.cwd(), '.e2e-identity-'));
  try {
    execFileSync(
      localTsc(),
      [
        ...MODULES.map((m) => `lib/trustshell/identity/${m}`),
        '--outDir', outDir,
      // Pin the root so output layout does not move when a module gains an
      // import from outside identity/ — repid-predicate.ts imports
      // ../EarnedMetrics, which silently relocated every .js file.
      '--rootDir', 'lib',
        '--module', 'commonjs',
        '--target', 'es2022',
        '--lib', 'es2022,dom',
        '--moduleResolution', 'node',
        '--esModuleInterop',
        '--strict',
      ],
      { stdio: 'pipe' }
    );
  } catch (err) {
    rmSync(outDir, { recursive: true, force: true });
    // Surface the compiler output — a bare "command failed" here would look
    // like an E2E failure rather than a type error.
    throw new Error(
      'could not compile lib/trustshell/identity for the E2E client:\n' +
        String(err.stdout ?? '') + String(err.stderr ?? err.message)
    );
  }

  const mods = {};
  for (const m of MODULES) {
    const name = m.replace(/\.ts$/, '');
    mods[name] = await import(pathToFileURL(join(outDir, 'trustshell', 'identity', `${name}.js`)).href);
  }
  return { mods, dispose: () => rmSync(outDir, { recursive: true, force: true }) };
}
