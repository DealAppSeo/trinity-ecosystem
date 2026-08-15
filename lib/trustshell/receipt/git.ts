// lib/trustshell/receipt/git.ts — pure parsing of git's machine-readable output.
//
// This exists as a module rather than a few lines inside the CLI because the few
// lines inside the CLI were WRONG, in a way no test of the receipt model could
// have caught: the caller trimmed the porcelain stream, which ate the leading
// status space of the first record and returned every path in it missing its
// first character. On a real session that produced one bogus reconciliation
// mismatch out of eleven files — a false accusation from the one check whose
// entire job is catching a false claim.
//
// Anything that parses a whitespace- or NUL-significant format belongs behind a
// function with assertions on it.

/**
 * Parse `git status --porcelain -uall -z` into repo-relative paths.
 *
 * Pass the stream EXACTLY as git produced it. Do not trim it: the first record
 * of an unstaged modification begins with a space (`" M path"`), and losing it
 * shifts every subsequent offset.
 *
 * Record format is `XY <path>` with NUL separators. A rename or copy is two
 * records — the status record carrying the NEW path, then the ORIGINAL path on
 * its own. Both sides changed, so both are returned; the origin is consumed
 * explicitly, because treating it as a status record would slice three
 * characters off a bare path.
 */
export function parsePorcelainZ(status: string): string[] {
  const out: string[] = [];
  const records = status.split('\0');

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (!record) continue;

    // A well-formed record is at least "XY p". Anything shorter is not a status
    // line — skip rather than slice into nothing and emit ''.
    if (record.length < 4) continue;

    const xy = record.slice(0, 2);
    const path = record.slice(3);
    if (path) out.push(path);

    if (xy.includes('R') || xy.includes('C')) {
      const origin = records[++i];
      if (origin) out.push(origin);
    }
  }

  return out;
}

/**
 * Parse `git log --name-only --pretty=format:` into paths.
 *
 * The empty pretty format leaves a blank line between commits, so blanks are
 * separators and not data.
 */
export function parseLogNameOnly(log: string): string[] {
  return log
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}
