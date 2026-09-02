// lib/trustshell/runtime/file-executor.ts — the reference real side effect.
//
// The vertical slice needs ONE real effect on the world, not a counter. A file
// write is that effect: bytes hit disk, it is reversible, it needs no network, and
// it runs identically in CI. It is deliberately generic — the runtime (execute.ts)
// is agnostic to what the executor does; this is one concrete `Executor`.
//
// PATH SAFETY IS PART OF THE EFFECT'S OWN CONTRACT. The kernel authorizes the
// CAPABILITY (`fs.write`); the executor still refuses to write outside its scratch
// root. A capability to write is not a capability to write ANYWHERE — path
// traversal (`../../etc/passwd`, an absolute path) is rejected here, so even a
// correctly-authorized write cannot escape its sandbox. That is defence-in-depth
// beneath the kernel, not a substitute for it.

import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import type { Executor } from './execute';

export interface FileWriteArgs {
  /** Path RELATIVE to the scratch root. Absolute paths and traversal are rejected. */
  readonly path: string;
  readonly contents: string;
}

/**
 * Build a file-write executor confined to `rootDir`. The returned executor writes
 * `contents` to `rootDir/path`, creating parents, but only when the resolved
 * target stays inside `rootDir`.
 */
export function makeFileWriteExecutor(rootDir: string): Executor {
  const root = resolve(rootDir);
  return async (_envelope, args) => {
    const a = args as Partial<FileWriteArgs> | null;
    if (!a || typeof a.path !== 'string' || typeof a.contents !== 'string') {
      return { outcome: 'error', detail: 'file-write args must be { path: string, contents: string }' };
    }
    const target = resolve(root, a.path);
    const rel = relative(root, target);
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
      return { outcome: 'error', detail: `path escapes the scratch root: ${a.path}` };
    }
    try {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, a.contents, 'utf8');
      return { outcome: 'committed', detail: `wrote ${a.contents.length} byte(s) to ${rel}` };
    } catch (e) {
      return { outcome: 'error', detail: `write failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  };
}
