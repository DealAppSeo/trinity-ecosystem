// Native fetch used

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = 'DealAppSeo/trinity-ecosystem';
const [owner, repoName] = REPO.split('/');

async function createIssue(title, body, labels) {
    const url = `https://api.github.com/repos/${owner}/${repoName}/issues`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title, body, labels })
    });

    if (!response.ok) {
        const err = await response.json();
        console.error(`Failed to create issue: ${title}`, err);
        return null;
    }
    const data = await response.json();
    console.log(`✅ Created issue: ${title} (#${data.number})`);
    return data;
}

const tasks = [
    {
        title: '[GROK] Deploy EIP-8004 Registries to Base Sepolia',
        labels: ['sprint-task', 'author:grok', 'verifier:claude'],
        body: `## Task: EIP-8004 Foundation Deployment
**Agent:** Grok (W3C Specialist)
**Objective:** Deploy the initial Soulbound RepID registries to Base Sepolia.

### Requirements:
1. Initialize Foundry project in /contracts.
2. Implement EIP-8004 standard for reputation identifiers.
3. Deploy to Base Sepolia.
4. Verify contract on Basescan.

### Acceptance Criteria:
- Contract address returned and documented in AI_CONTEXT.md.
- Test suite passes in Foundry.`
    },
    {
        title: '[CLAUDE] Establish ANFIS Routing Baseline',
        labels: ['sprint-task', 'author:claude', 'verifier:grok'],
        body: `## Task: ANFIS Logic Calibration
**Agent:** Claude (ORCH)
**Objective:** Establish the mathematical routing baseline for the 3x3 grid.

### Requirements:
1. Review Phase 0 logs for tool usage latency.
2. Define initial membership functions for "Accuracy", "Speed", and "Ethics".
3. Update /lib/agent/anfis.ts with calibrated weights.

### Acceptance Criteria:
- weights.json updated with baseline parameters.
- Routing simulations show 95%+ alignment with Trinity Protocol.`
    },
    {
        title: '[CLAUDE] Shadow RepID Schema Design',
        labels: ['sprint-task', 'author:claude', 'verifier:gemini'],
        body: `## Task: RepID Data Architecture
**Agent:** Claude (ORCH)
**Objective:** Design the Supabase schema for off-chain Reputation tracking.

### Requirements:
1. Create SQL migration for 'reputation_ledger' table.
2. Link agent heartbeats to rep gain/loss triggers.
3. Implement 'shadow' validation logic (simulating on-chain state).

### Acceptance Criteria:
- Migration file created in /supabase/migrations.
- API endpoints for reputation query verified.`
    }
];

async function main() {
    if (!GITHUB_TOKEN) {
        console.error('Error: GITHUB_TOKEN environment variable is not set.');
        process.exit(1);
    }

    console.log('🚀 Seeding Phase 1 Tasks into GitHub...');
    for (const task of tasks) {
        await createIssue(task.title, task.body, task.labels);
    }
}

main();
