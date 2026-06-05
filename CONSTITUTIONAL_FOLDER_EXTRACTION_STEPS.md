# Constitutional Folder Extraction Steps (Phase 2, 2026-06-04 XC)

**UNRECOVERABLE via git** (archaeology + clue investigation: no top-level/services constitutional/ dir in any commit/tree/fsck/disk scan, including suspect 5523937 parent and post-ANFIS commits; only shared refs + worktree caches of smaller CONSTITUTION.md + ConstitutionalAgentV4.js).

## Recommended: Extract from Apr-10 py-brain Railway deploy image
**Exact steps for Sean/CC (Railway access required):**

1. Identify the deploy: Railway project for py-brain / trinity-ecosystem / trinity-science (the one active ~2026-04-10; check deploys history or git SHA around that date in the service).

2. Access the image/layer:
   - Via Railway dashboard: find the specific deploy (Apr-10), use "Download logs" or "One-off command" to run in the container.
   - Or Railway CLI: `railway run --service <py-brain-service> -- bash -c 'find /app -name "*constitution*" -o -path "*/constitutional/*" | head -20' ` (or docker equivalent if image pulled).
   - If image available: `docker pull <railway-image-sha>` ; `docker run --rm -it <image> find / -path '*/constitutional*' -o -name '*CONSTITUTION*' 2>/dev/null | head -10`

3. Extract the folder:
   - In one-off or container: `tar -czf /tmp/constitutional-lost.tar.gz /app/trinity-ecosystem/constitutional /app/.../CONSTITUTION* /app/.../ConstitutionalAgent* 2>/dev/null || true`
   - Download the tar: use Railway's file transfer or `railway cp` if supported, or copy via volume mount in a temp deploy.
   - Alternative: if build cache or artifact store has the layer from Apr-10 build, download the layer tar and extract the paths.

4. Verify against known:
   - Compare size/structure to shared/CONSTITUTION.md (v8.2.0, triune ALPHA/BETA/GAMMA, etc.) + the ConstitutionalAgentV4.js from shared (in constitutional-agent-base.js and sub agents).
   - The "larger" folder per Sean/handoff should have additional local trinity-ecosystem extensions (more articles, agent-specific constitutions, HyperDAG-specific, etc.).

5. Import to repo: on a branch (e.g. the recovery feat/xc-2026-06-04-recover-lost-files), place in trinity-ecosystem/constitutional/ or appropriate; commit with note "extracted from Apr-10 Railway image (pre-loss)".

**OR recommend rebuild (if extraction not immediate):**
- Rebuild the larger folder from:
  - shared/CONSTITUTION.md (base content, versioned).
  - shared constitutional-agent-base.js + the ConstitutionalAgentV4.js in torch/veritas/w3c (the agent implementations with ANFIS reward/routing).
  - The recovered refs in .claude/worktrees (if any additional).
- Evidence: these are the "current known" constitutional pieces; handoff says the lost was larger, so this seeds it; add trinity-ecosystem specific (e.g. local extensions from prior reports like CONSTITUTION in ecosystem).
- Do NOT delete the shared one; keep as canonical small version.

**Recommendation:** Prioritize Railway image extraction (exact pre-loss state, per handoff "the April-10 py-brain Railway deploy image contains the files"). If blocked, rebuild from shared + agents as above (suffices for core, larger by adding ecosystem-specific from archaeology notes).

*Per sprint Phase 2; cite recovery manifest, handoff §2/9, shared/CONSTITUTION.md + agent files. Recommend, do not delete. Micah 6:8.*
