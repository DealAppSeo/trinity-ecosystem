# Sprint: Portable zk Trust Harness

Canonical brief for all agents.
Precedence: SPRINT-DECISIONS-*.md on main > docs/TRUST-HARNESS-STATUS-2026-08-17.md > this file > chat.

Agents must use this path only. Do not use Windows E:\ paths.

## Product
TrustShell / HyperDAG is a portable customizable zk trust harness:
weighted + earned zkRepID, HAL, dual-auth, high-safety defaults,
x402 + ERC-8004, no vendor lock-in for any AI service.
Persistent multi-memory; hybrid vector + GraphRAG; adaptive routing
under hard trust ceilings. npm install must not lie about keyless behavior.

## Hard rules
- Fail loud; measured over aspirational
- No DEFAULT_WEIGHTS changes without explicit decision on main
- No synthetic agents / fake ERC-8004 identities
- Supabase + existing GraphRAG authoritative; new stores are adapters only
- One concern → one implementation (no parallel duplicate modules)
- No invented payment traffic
- Pull main and search for your topic before writing

## Active resolutions
- P3 decay: ONE module only; shape gated; rate NOT_CHECKED; census not "21 live floor-sitters"
- NORTH-STAR: read-mostly; append-only status bullets
- P5 reweight: blocked until real BFT observations

## Idle agents
Pull main. Read `docs/TRUST-HARNESS-STATUS-2026-08-17.md` (proven / observe-only / blocked).
Then this file + SPRINT-DECISIONS. Do not duplicate open work. Do not restate
the retracted unobserved-floor census. Do not call shadow or observe-mode "enforced".
