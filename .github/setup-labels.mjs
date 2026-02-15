import { execSync } from 'child_process';

/**
 * Setup Labels: Node.js/GitHub API implementation.
 * Replaces setup-labels.sh for environments without 'gh' CLI.
 */

const REPO = process.argv[2] || 'DealAppSeo/trinity-ecosystem';
const TOKEN = process.env.GITHUB_TOKEN;

const LABELS = [
    { name: "author:claude", color: "D4A574", desc: "Work authored by Claude" },
    { name: "author:gemini", color: "4285F4", desc: "Work authored by Gemini/Antigravity" },
    { name: "author:grok", color: "1DA1F2", desc: "Work authored by Grok" },
    { name: "verifier:claude", color: "D4A574", desc: "Claude assigned as verifier" },
    { name: "verifier:gemini", color: "4285F4", desc: "Gemini assigned as verifier" },
    { name: "verifier:grok", color: "1DA1F2", desc: "Grok assigned as verifier" },
    { name: "handoff", color: "7057FF", desc: "Cross-agent task transfer" },
    { name: "verification", color: "0E8A16", desc: "Requires cross-agent verification" },
    { name: "approved", color: "0e8a16", desc: "Verification successful - ready to merge/close" },
    { name: "changes-requested", color: "d93f0b", desc: "Verification found issues - needs revision" },
    { name: "answered", color: "006b75", desc: "Agent question has been answered" },
    { name: "blocked", color: "D93F0B", desc: "Cannot proceed - needs intervention" },
    { name: "sprint-task", color: "7057FF", desc: "Current sprint work item" }
];

async function setup() {
    if (!TOKEN) {
        console.error('❌ GITHUB_TOKEN missing.');
        process.exit(1);
    }

    console.log(`🏷️  Setting up labels for ${REPO}...`);

    for (const label of LABELS) {
        console.log(`Creating: ${label.name}...`);
        try {
            execSync(`curl -s -X POST -H "Authorization: token ${TOKEN}" -H "Accept: application/vnd.github.v3+json" https://api.github.com/repos/${REPO}/labels -d '${JSON.stringify(label)}'`);
        } catch (e) {
            // Label likely exists, ignore error
        }
    }
    console.log('✅ Done.');
}

setup();
