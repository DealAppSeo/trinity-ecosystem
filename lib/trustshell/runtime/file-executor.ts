// lib/trustshell/runtime/file-executor.ts — the reference real side effect.
//
// The vertical slice needs ONE real effect on the world, not a counter. A file
// write is that effect: bytes hit disk, it is reversible, it needs no network, and
// it runs identically in CI. It is deliberately generic — the runtime (execute.ts)
// is agnostic to what the executor does; this is one concrete `Executor`.
//
// PATH SAFETY IS PART OF THE EFFECT'S OWN CONTRACT. The kernel authorizes the
// CAPABILITY (`fs.write`); the executor still refuses to write outside its scratch
// root. A capability to write is not a capability to write ANYWHERE. Two layers:
//   * LEXICAL — the resolved target must be inside the root (rejects `../..`,
//     an absolute path outside the root).
//   * REAL-PATH — after creating parents, the REAL (symlink-resolved) parent must
//     still be inside the real root, and the target must not already be a symlink.
//     This closes the escape where a symlinked directory *inside* the root points
//     out of it — a lexical check alone would follow it. (Independent verification
//     flagged the symlink case; this is the fix.)
// That is defence-in-depth beneath the kernel, not a substitute for it.

import { writeFile, mkdir, realpath, lstat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import type { Executor } from './execute';

export interface FileWriteArgs {
  /** Path resolved against the scratch root. A path that resolves OUTSIDE the root
   *  — via traversal, an absolute path outside it, or a symlink — is rejected; an
   *  absolute path that happens to resolve inside the root is fine. */
  readonly path: string;
  readonly contents: string;
}

/** True when `child` is inside `parent` (or equal to it). Both should be resolved. */
function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Build a file-write executor confined to `rootDir`. The returned executor writes
 * `contents` to `rootDir/path`, creating parents, but only when both the lexical
 * target and its real (symlink-resolved) parent stay inside `rootDir`.
 */
export function makeFileWriteExecutor(rootDir: string): Executor {
  const root = resolve(rootDir);
  return async (_envelope, args) => {
    const a = args as Partial<FileWriteArgs> | null;
    if (!a || typeof a.path !== 'string' || typeof a.contents !== 'string') {
      return { outcome: 'error', detail: 'file-write args must be { path: string, contents: string }' };
    }
    const target = resolve(root, a.path);
    // (1) Lexical containment — fast reject of `..` / absolute-outside.
    if (!isInside(root, target) || target === root) {
      return { outcome: 'error', detail: `path escapes the scratch root: ${a.path}` };
    }
    try {
      await mkdir(dirname(target), { recursive: true });
      // (2) Real-path containment — resolve symlinks and re-check. A symlinked
      //     directory inside the root that points out of it is caught here.
      const rootReal = await realpath(root);
      const parentReal = await realpath(dirname(target));
      if (!isInside(rootReal, parentReal)) {
        return { outcome: 'error', detail: `path escapes the scratch root via a symlink: ${a.path}` };
      }
      // (3) Refuse to write through an existing symlink at the target itself.
      if (existsSync(target) && (await lstat(target)).isSymbolicLink()) {
        return { outcome: 'error', detail: `target is a symlink; refusing to write through it: ${a.path}` };
      }
      const rel = relative(root, target);
      await writeFile(target, a.contents, 'utf8');
      return { outcome: 'committed', detail: `wrote ${a.contents.length} byte(s) to ${rel}` };
    } catch (e) {
      return { outcome: 'error', detail: `write failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  };
}
