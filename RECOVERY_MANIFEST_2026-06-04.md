# RECOVERY MANIFEST — 2026-06-04 (XC forensics)

**Repo:** trinity-ecosystem (on branch feat/xc-2026-06-04-recover-lost-files only; NEVER pushed to main)
**Date:** 2026-06-04 PT
**Source of truth for expected content:** trinity-symphony-shared/CONSTITUTION.md (smaller); handoff states trinity-ecosystem had *larger* constitutional folder.

## Recovered targets

| path | size (bytes) | source commit | recovered (yes/no) | notes |
|------|--------------|---------------|--------------------|-------|
| services/anfis-routing-service/package.json | ~12 lines (from show) | 0da0d4d feat(gemini): overnight Phase 2 - MCP Gateway & ANFIS | yes | Recovered via `git checkout 0da0d4d -- services/anfis-routing-service` (the commit that introduced/touched the service source). Also present in dangling de6eb4e tree. |
| services/anfis-routing-service/package-lock.json | 827+ lines (from show) | 0da0d4d | yes | Same as above. |
| services/anfis-routing-service/server.js | 38+ lines | 0da0d4d | yes | The core server for the Node bridge to rust-brain ANFIS. |
| apps/rust-brain/src/anfis_router.rs | (present in dangling) | de6eb4e (dangling) + 0da0d4d range | partial (via tree inspect) | Rust side of ANFIS routing (not the lost Node service, but related). Recovered in sense of identified in history. |
| constitutional/ (or constitution/ at root or services) | N/A | none in rev-list / fsck / ls-tree across all | **NO** (UNRECOVERABLE-via-git) | No commit in full history (post fetch --all + rev-list scan + fsck dangling) contained a top-level or services/constitutional/ folder. Only references in .claude/worktrees to trinity-symphony-shared copies (which have ConstitutionalAgent*.js etc, nomenclature-constitution, and the CONSTITUTION.md). Disk scan (OneDrive/Desktop/repos limited) found no additional legacy trinity-ecosystem constitutional/ dir outside .git/worktrees/node_modules. |

## Recovery process summary (commands + outputs cited)
- Established loss: `git ls-files services/anfis-routing-service` = 0; no native constitutional/ dir in ls-files or find (only .claude/worktree refs to shared).
- Deleting/add commits: 0da0d4d (add/touch of the anfis service files: package*.json + server.js); no explicit D for the dir in 0da0d4d..HEAD range (possible clean/reset or partial history); 5523937 "restore: full trinity-ecosystem codebase" (no constitutional dir in its tree).
- Recovery: `git checkout 0da0d4d -- services/anfis-routing-service` brought the 3 files (now in working tree + ls-files 3). fsck found dangling de6eb4e (chore, contains the anfis files in tree + shared constitutional refs).
- Dangling: `git fsck --lost-found` → de6eb4e730c03a773350100ccb39969ab9fa2fef (inspected, no new constitutional dir).
- On-disk: no additional trinity-ecosystem constitutional/ found in bounded scans of OneDrive/Desktop/other repos.
- Cross-ref: trinity-symphony-shared/CONSTITUTION.md (read; version 8.2.0, articles on triune, antifragile, etc.) — the "larger" folder in trinity-ecosystem likely contained additional local extensions, agents-specific constitutions, or expanded docs beyond this.
- Fallback (documented, not executed): April-10 py-brain Railway deploy (trinity-ecosystem/trinity-science predates loss; its image/layer contains the files). Sean/CC with Railway access can extract (e.g. docker cp or build artifact). This is the reliable source per handoff if git yields incomplete.

## Post-recovery state on branch
- Branch: feat/xc-2026-06-04-recover-lost-files (created from current; clean before recovery; files added via checkout).
- The 3 anfis files are now present in the tree on this branch (recoverable for Sean/Claude to review/commit if desired).
- No constitutional/ dir restored (git/on-disk insufficient).

## Clue integration (added per 2026-06-04 update under Phase 1)
The same TrustRails overwrite likely hit both app.aitrinitysymphony.com (tab title "TrustRails – SSL Trust Layer… on Solana") and the trinity-ecosystem repo on the same day. So in history, look specifically for the commit where TrustRails content was added and the ANFIS routing + constitutional content was removed in the same change — correlate by date. That commit is the prime suspect for the deletion; its parent holds the lost ANFIS/constitution files.

**Investigation of clue:**
- Prime suspect commit per clue (TrustRails addition/restore that correlates with content changes): 5523937d9d8951b76dcd5959d50e9056803fb4d6 "restore: full trinity-ecosystem codebase" (Fri Apr 17 2026).
  - Added large TrustRails content: app/api/trustrails/demo/route.ts, villain, pay, receipts, settings, system-trust, vault, internal/*, repid/configure, and many .next build artifacts for TrustRails routes.
  - Also added constitutional content (from shared): shared/constitutional-agent-base.js (1389 lines), nomenclature-constitution.js/ts, torch/veritas/w3c/ConstitutionalAgentV4.js.
  - No D for ANFIS (ANFIS source added later in May in 0da0d4d) or for a "larger" local constitutional folder in this commit's diff (it brought in the shared version).
- Date correlation: 5523937 Apr 17 (TrustRails heavy restore); ANFIS source touched/added in 0da0d4d May 13 (which also touched some TrustRails .next files as M). No single commit in searched history (post-fetch, name-status walks, rev-list transitions) showed *both* TrustRails A *and* D for ANFIS source + constitutional folder in the exact same change after the ANFIS add date.
- Parent of 5523937 (7bc1b24aaf2d4c1b282b4e38112a7b91e3630233 "fix(zkp-postcard)..."): inspected ls-tree; no ANFIS or constitutional dir in parent tree. Checkout from parent for paths failed (pathspec no match).
- Additional post-May 13 commits inspected (110d405, 0e5de34, 674f378 etc.): some have no ANFIS in tree (post-loss), but no clear D + TrustRails A pair matching the exact clue for constitutional removal + ANFIS removal in one TrustRails addition commit.
- Conclusion for recovery: The clue pointed to 5523937 as the TrustRails overwrite event. Git history did not yield a commit with the simultaneous removal of "larger" constitutional + ANFIS in the TrustRails addition change (history may be partial or the larger folder was local/untracked or removed outside a single tracked commit). ANFIS source recovered separately from 0da0d4d (the commit that had it). Constitutional remains UNRECOVERABLE-via-git.

## Recommendations
- If more history (private remote refs, other clones with full reflog) exists, re-run `git fsck --lost-found; git log --all --diff-filter=D -- '**/constitutional*'` on a fuller clone.
- For the full larger constitutional: use the April-10 Railway image as primary fallback. Extract and compare to shared/CONSTITUTION.md + the recovered ConstitutionalAgent refs.
- The recovered anfis-routing-service/server.js + package* provide the "source lost" bridge (Node to rust-brain ANFIS).
- Per clue, the parent of the identified TrustRails overwrite (5523937) or the 0da0d4d commit (for ANFIS) are the best git sources; fallback to Railway deploy image for complete pre-loss state.

*All per sprint Phase 1 (clue integrated); citations in XC_REPORT_2026-06-04.md. Micah 6:8.*