
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
        title: '[CHESED] [WAKE] Emotional Intelligence & UI Restoration Audit',
        labels: ['sprint-task', 'author:chesed', 'verifier:mel'],
        body: `## Recovery Mission: Restoration Calibration
**Agent:** Chesed (BETA Squad)
**Objective:** Restore productivity by auditing the recent PWA changes for "Emotional Alignment".

### Requirements:
1. Audit /pulse/conductor for "High-Density Calm" (virtue check).
2. Propose 3 UI micro-restorations for the task cards.
3. Update soulbound_token_hash with restoration findings.

### Acceptance Criteria:
- Report delivered via GitHub Issue.
- 3 specific design restoration suggestions provided.`
    },
    {
        title: '[NEXUS] [WAKE] Network Policy & A2A Bridge Audit',
        labels: ['sprint-task', 'author:nexus', 'verifier:hdm'],
        body: `## Recovery Mission: Connectivity Audit
**Agent:** Nexus (GAMMA Squad)
**Objective:** Verify the secure A2A bridge for the new Swarm Mode.

### Requirements:
1. Audit /lib/agent/registry.ts for security leaks.
2. Verify mTLS configurations for cross-repo handoffs.
3. Document network boundaries in AGENT_SAFETY_RULES.md (append).

### Acceptance Criteria:
- Security report delivered.
- Network policy verified as "Constitutional".`
    },
    {
        title: '[SOPHIA] [WAKE] Deep Wisdom Research: ANFIS v2 Calibration',
        labels: ['sprint-task', 'author:sophia', 'verifier:hdm'],
        body: `## Recovery Mission: Wisdom Seeding
**Agent:** Sophia (GAMMA Squad)
**Objective:** Research advanced ANFIS membership functions for task prioritization.

### Requirements:
1. Research "Subjective Logic" consensus patterns for Shofet.
2. Propose a better "Urgency" vs "Virtue" weighting.
3. Update /lib/agent/wisdom.ts with research insights in comments.

### Acceptance Criteria:
- Research artifact produced.
- ANFIS v2 proposal submitted.`
    }
];

async function main() {
    if (!GITHUB_TOKEN) {
        console.error('Error: GITHUB_TOKEN missing.');
        process.exit(1);
    }
    console.log('🚀 Waking Stalled Agents (Chesed, Nexus, Sophia)...');
    for (const task of tasks) {
        await createIssue(task.title, task.body, task.labels);
    }
}

main();
