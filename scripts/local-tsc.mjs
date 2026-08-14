// Resolve the repo's own TypeScript compiler.
//
// The check scripts used to shell out to `npx tsc`. With node_modules present
// that resolves the pinned typescript@5.6.x and works. With node_modules absent
// — a fresh clone, a fresh CI runner, a reclaimed container — npx silently
// fetches the *latest* TypeScript instead. TypeScript 6 refuses `tsc <file>`
// while a tsconfig.json exists:
//
//   error TS5112: tsconfig.json is present but will not be loaded if files are
//   specified on commandline. Use '--ignoreConfig' to skip this error.
//
// so every check script exits 1 before running a single assertion. The suite is
// fine; it is merely uninstalled. That failure reads as "128 assertions are
// broken", which is the most expensive way to be wrong about a test suite.
//
// Resolving the local binary makes the two cases distinguishable: a missing
// install says so in one line, and a real compile error stays a real compile
// error.

import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function localTsc() {
  const bin = join('node_modules', '.bin', 'tsc');
  if (!existsSync(bin)) {
    console.error(
      'TypeScript is not installed locally (looked for node_modules/.bin/tsc).\n' +
        'Run `npm install` and try again.\n' +
        '\n' +
        'This check deliberately does not fall back to `npx tsc`: with no local\n' +
        'install that resolves the latest TypeScript, which fails TS5112 against\n' +
        "this repo's tsconfig.json and makes an uninstalled tree look like a\n" +
        'broken test suite.'
    );
    process.exit(1);
  }
  return bin;
}
