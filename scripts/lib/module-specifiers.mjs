// scripts/lib/module-specifiers.mjs
//
// What does this TypeScript file import? Harder than it looks, and it was wrong
// twice before it was right.
//
// Lives here rather than inside `check-package-boundary.mjs` so the mutation
// manifest can break the EXTRACTOR and watch the suite go red. A parser that
// silently under-reports produces a clean boundary report, which is the same
// failure class as a green tick describing a different job — so the parser
// itself has to be load-bearing, not incidental.
//
// ── THE THREE SHAPES THAT DEFEATED EARLIER ATTEMPTS ─────────────────────────
//
//  1. PROSE. `/from\s+['"]…/` over raw source matches comments. Four modules in
//     `lib/trustshell` were reported as carrying npm dependencies because their
//     header comments contain the word "from" followed by a quoted phrase.
//
//  2. MULTI-LINE IMPORTS. Anchoring to `^\s*(import|export)…from` on a single
//     line fixed (1) and broke everything else: `import {\n Connection,\n } from
//     '@solana/web3.js'` has no `import` on the line carrying the specifier, so
//     `SolanaExecutor.ts` — which imports two Solana packages — was classified
//     as having no dependencies at all.
//
//  3. TEMPLATE LITERALS. `` `retargets audience from '${a.audience}' to …` ``
//     survives comment-stripping because it is code, and yields a phantom
//     specifier `${a.audience}`.
//
// The answer is to match the SPECIFIER rather than the statement, over
// comment-stripped source, and to drop anything that cannot be a module path.

/**
 * Remove comment lines.
 *
 * WHOLE-LINE ONLY. Stripping `//` mid-line would truncate every `https://` URL
 * in the source; nothing that consumes this needs those lines intact beyond the
 * import specifiers, but a truncated line can still join two statements into one
 * and is not worth the risk.
 */
export function stripComments(source) {
  let inBlock = false;
  return source
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (inBlock) {
        if (t.includes('*/')) inBlock = false;
        return false;
      }
      if (t.startsWith('/*')) {
        if (!t.includes('*/')) inBlock = true;
        return false;
      }
      return !t.startsWith('//') && !t.startsWith('*');
    })
    .join('\n');
}

/**
 * Every module specifier this source imports, deduplicated.
 *
 * Covers `from '…'` (static import and re-export, however many lines it spans),
 * dynamic `import('…')`, and `require('…')`. Anything containing `${` or a
 * space is discarded: neither can appear in a real module path, and both are how
 * string content leaks in.
 */
export function specifiersOf(source) {
  const code = stripComments(source);
  const found = [
    ...code.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g),
    ...code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]/g),
    ...code.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g),
  ].map((m) => m[1]);
  return [...new Set(found.filter((s) => !s.includes('${') && !s.includes(' ')))];
}
