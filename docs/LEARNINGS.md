# Documentation & Learnings: Agent System Upgrade

## Critical Configuration

> [!IMPORTANT]
> The Agent system relies on strict environment configuration and external resources.

1.  **Environment Variables**:
    *   The system *cannot* run without valid `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_KEY`.
    *   Attempting to instantiate `ConstitutionalAgent` without these will cause a crash.
    *   For local testing, always ensure `.env.local` is present or mock values are passed (as seen in `scripts/verify-transplant.ts`).

2.  **MCP Protocol Access**:
    *   The agent loads operational protocols (WAKE, EXECUTE, etc.) from GitHub.
    *   **Action Required**: The contents of `docs/MCPs/*.md` MUST be pushed to the `main` branch of the repository.
    *   **Failure Mode**: If the fetch fails (404), the agent falls back to hardcoded strings, but this is a degraded state.
    *   **Local Dev**: Changes to MCP files locally will NOT be reflected in the agent until pushed, unless the codebase is modified to read from the local file system.

## Database Integrity

1.  **ReplID & Registry**:
    *   Agents rely on `trinity_agent_registry` for tiers and reputation.
    *   New agents auto-register with Rep: 10, Tier: Assist.

2.  **Retrospectives**:
    *   Strategy 10 requires the `trinity_retros` table.
    *   Apply `sql/trinity_retros.sql` to the Supabase instance to enable this feature.

## Debugging

- **Simulating Agents**: Use `scripts/run-agent.ts <NAME>` to spin up a single agent process.
- **Verification**: Use `scripts/verify-transplant.ts` to test the internal organs (Session Metrics, Bible, Healing Loop).
- **TypeScript Execution**: Use `tsx` (via `npx -y tsx`) for executing scripts in this hybrid module environment. `ts-node` may fail with ESM/CJS interop issues.
