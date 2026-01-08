
-- sql/seed_training_tasks.sql
-- Productive Training Missions for Trinity Agents (Startup Doctrine Aligned)

INSERT INTO trinity_tasks (title, description, status, priority, assigned_to, task_type, created_at, metadata) VALUES

-- 1. HDM: Master Trust Card (Infrastructure)
('Generate Master Trust Card for Trinity Ecosystem', 
 'Using docs/templates/TRUST_CARD_TEMPLATE.md, create a "Master Trust Card" for the entire Trinity Ecosystem. Define our aggregate Capabilities (Swarm functionality), Safety Limits (Doctrine), and calculate an initial "System RepID" based on current component checks. Save output to artifacts/trust-cards/trinity-master.md', 
 'pending', 
 1, 
 'HDM', 
 'code', 
 NOW(),
 '{"requires_external_artifact": true}'),

-- 2. VERITAS: VC Scout Analysis (Research)
('VC Scout Analysis: AISocialMirror.com', 
 'Act as the VC Scout. Use Playwright to ethically scrape/analyze aisocialmirror.com. Apply the Startup Doctrine "Investment Matrix" to determine if it is "AI Native" or a "Legacy Wrapper". Recommend 3 verifiable improvements. Save report to artifacts/research/vc-scout-aisocialmirror.md', 
 'pending', 
 2, 
 'VERITAS', 
 'research', 
 NOW(),
 '{"requires_external_artifact": true}'),

-- 3. MEL: Welcome Email Sequence (Content)
('Draft "Welcome to Trinity" Email Sequence', 
 'Create a 3-part email sequence for new Verified Users. Tone: Warm, Protective, Ethical. Focus on explaining the value of RepID and "Safe Execution". Explicitly reference our "No Secrets Exfiltration" policy. Save draft to artifacts/content/welcome-sequence.md', 
 'pending', 
 3, 
 'MEL', 
 'content', 
 NOW(),
 '{"requires_external_artifact": true}'),

-- 4. TORCH: Survivor Protocol Check (System)
('Run Survivor Protocol Simulation', 
 'Simulate a critical failure of the Orchestrator node. Document the "Survivor Boot" steps you would take to revive the network. Verify your heartbeat access. Save simulation log to artifacts/system/survivor-sim.md', 
 'pending', 
 1, 
 'TORCH', 
 'system', 
 NOW(),
 '{"requires_external_artifact": true}'),

-- 5. W3C: Web3 Feasibility Study (Research)
('Research RepID on Solana vs. Base', 
 'Research technical feasibility of minting RepIDs as non-transferable NFTs (SBTs). Compare Solana (compression) vs. Base (EVM compatibility). Recommend one for the MVP wedge. Save report to artifacts/research/repid-solana-vs-base.md', 
 'pending', 
 3, 
 'W3C', 
 'research', 
 NOW(),
 '{"requires_external_artifact": true}'),

-- 6. MCP: Competitor Scan (Evergreen)
('[EVERGREEN] Daily Competitor Scan', 
 'Use PlaywrightMCP to scan top competitor sites (e.g., Salesforce Agentforce). Compare vs. Trinity Trust Card. Log diffs to artifacts/logs/competitor-scan.md', 
 'pending', 
 2, 
 'MCP', 
 'research', 
 NOW(),
 '{"is_evergreen": true, "recurrence": "24h", "requires_external_artifact": true}');
