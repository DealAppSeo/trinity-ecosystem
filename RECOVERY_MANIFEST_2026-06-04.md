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

## Recommendations
- If more history (private remote refs, other clones with full reflog) exists, re-run `git fsck --lost-found; git log --all --diff-filter=D -- '**/constitutional*'` on a fuller clone.
- For the full larger constitutional: use the April-10 Railway image as primary fallback. Extract and compare to shared/CONSTITUTION.md + the recovered ConstitutionalAgent refs.
- The recovered anfis-routing-service/server.js + package* provide the "source lost" bridge (Node to rust-brain ANFIS).

*All per sprint Phase 1; citations in XC_REPORT_2026-06-04.md. Micah 6:8.*