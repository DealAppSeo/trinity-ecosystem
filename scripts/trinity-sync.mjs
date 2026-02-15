/**
 * Trinity Sync - Automated Context Synchronization
 * 
 * Syncs GitHub Issue statuses into AI_CONTEXT.md automatically.
 * Eliminates manual "harvesting" from the daily rituals.
 * 
 * Usage:
 *   GITHUB_TOKEN=xxx node trinity-sync.mjs owner/repo
 * 
 * Or as a cron job / GitHub Action for continuous sync.
 */

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

const AGENTS = ['claude', 'gemini', 'grok'];
const STATUS_ICONS = {
  'open': '🔄',
  'closed': '✅',
  'blocked': '❌',
};

async function fetchGitHubIssues(repo, token) {
  const [owner, repoName] = repo.split('/');
  const url = `https://api.github.com/repos/${owner}/${repoName}/issues?state=all&per_page=100`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  return response.json();
}

function categorizeIssues(issues) {
  const categories = {
    blocked: [],
    inProgress: [],
    todo: [],
    needsReview: [],
    recentlyClosed: [],
    byAgent: {
      claude: { authored: [], verifying: [] },
      gemini: { authored: [], verifying: [] },
      grok: { authored: [], verifying: [] },
    },
  };

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  for (const issue of issues) {
    if (issue.pull_request) continue; // Skip PRs

    const labels = issue.labels.map(l => l.name.toLowerCase());

    // Categorize by status
    if (labels.includes('blocked')) {
      categories.blocked.push(issue);
    } else if (issue.state === 'open' && labels.includes('in-progress')) {
      categories.inProgress.push(issue);
    } else if (issue.state === 'open') {
      categories.todo.push(issue);
    } else if (labels.includes('needs-review') || labels.includes('verification')) {
      categories.needsReview.push(issue);
    } else if (issue.state === 'closed' && new Date(issue.closed_at) > oneDayAgo) {
      categories.recentlyClosed.push(issue);
    }

    // Categorize by agent
    for (const agent of AGENTS) {
      if (labels.includes(`author:${agent}`)) {
        categories.byAgent[agent].authored.push(issue);
      }
      if (labels.includes(`verifier:${agent}`)) {
        categories.byAgent[agent].verifying.push(issue);
      }
    }
  }

  return categories;
}

function generateSprintStatusTable(categories) {
  let table = '| Task | Owner | Status | Verified By | Notes |\n';
  table += '|------|-------|--------|-------------|-------|\n';

  // Add blocked items first (highest priority)
  for (const issue of categories.blocked) {
    const author = issue.labels.find(l => l.name.startsWith('author:'))?.name.split(':')[1] || '?';
    const verifier = issue.labels.find(l => l.name.startsWith('verifier:'))?.name.split(':')[1] || 'TBD';
    table += `| #${issue.number}: ${issue.title.substring(0, 40)} | ${author} | ❌ BLOCKED | ${verifier} | Needs unblock |\n`;
  }

  // Add in-progress items
  for (const issue of categories.inProgress) {
    const author = issue.labels.find(l => l.name.startsWith('author:'))?.name.split(':')[1] || '?';
    const verifier = issue.labels.find(l => l.name.startsWith('verifier:'))?.name.split(':')[1] || 'TBD';
    table += `| #${issue.number}: ${issue.title.substring(0, 40)} | ${author} | 🔄 IN PROGRESS | ${verifier} | - |\n`;
  }

  // Add todo items
  for (const issue of categories.todo) {
    const author = issue.labels.find(l => l.name.startsWith('author:'))?.name.split(':')[1] || '?';
    const verifier = issue.labels.find(l => l.name.startsWith('verifier:'))?.name.split(':')[1] || 'TBD';
    table += `| #${issue.number}: ${issue.title.substring(0, 40)} | ${author} | 🆕 TODO | ${verifier} | Backlog |\n`;
  }

  // Add needs-review items
  for (const issue of categories.needsReview) {
    const author = issue.labels.find(l => l.name.startsWith('author:'))?.name.split(':')[1] || '?';
    const verifier = issue.labels.find(l => l.name.startsWith('verifier:'))?.name.split(':')[1] || 'TBD';
    table += `| #${issue.number}: ${issue.title.substring(0, 40)} | ${author} | ⚠️ NEEDS REVIEW | ${verifier} | Awaiting verification |\n`;
  }

  // Add recently closed items
  for (const issue of categories.recentlyClosed.slice(0, 5)) {
    const author = issue.labels.find(l => l.name.startsWith('author:'))?.name.split(':')[1] || '?';
    const verifier = issue.labels.find(l => l.name.startsWith('verifier:'))?.name.split(':')[1] || '-';
    table += `| #${issue.number}: ${issue.title.substring(0, 40)} | ${author} | ✅ DONE | ${verifier} | Closed |\n`;
  }

  return table;
}

function generateBlockersSummary(categories) {
  if (categories.blocked.length === 0) {
    return '### Blockers\n- None currently\n';
  }

  let summary = '### Blockers\n';
  for (const issue of categories.blocked) {
    summary += `- **#${issue.number}**: ${issue.title}\n`;
    summary += `  - URL: ${issue.html_url}\n`;
    summary += `  - Assigned: ${issue.labels.find(l => l.name.startsWith('author:'))?.name || 'unassigned'}\n`;
  }
  return summary;
}

function generateSessionLogEntry(categories) {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0].substring(0, 5);

  let entry = `### ${dateStr} ${timeStr} (trinity-sync)\n`;
  entry += `- Auto-synced from GitHub\n`;
  entry += `- Blocked: ${categories.blocked.length}\n`;
  entry += `- In Progress: ${categories.inProgress.length}\n`;
  entry += `- Needs Review: ${categories.needsReview.length}\n`;
  entry += `- Completed (24h): ${categories.recentlyClosed.length}\n`;

  return entry;
}

async function updateAIContext(contextPath, categories) {
  let content = await readFile(contextPath, 'utf-8');

  // Update sprint status table
  const tableStart = content.indexOf('| Task | Owner | Status |');
  const tableEnd = content.indexOf('\n### ', tableStart);

  if (tableStart !== -1 && tableEnd !== -1) {
    const newTable = generateSprintStatusTable(categories);
    content = content.substring(0, tableStart) + newTable + content.substring(tableEnd);
  }

  // Update blockers section
  const blockersStart = content.indexOf('### Blockers');
  const blockersEnd = content.indexOf('\n### ', blockersStart + 1);

  if (blockersStart !== -1 && blockersEnd !== -1) {
    const newBlockers = generateBlockersSummary(categories);
    content = content.substring(0, blockersStart) + newBlockers + content.substring(blockersEnd);
  }

  // Add session log entry
  const sessionLogMarker = '## 📝 Session Log';
  const sessionLogStart = content.indexOf(sessionLogMarker);

  if (sessionLogStart !== -1) {
    const insertPoint = sessionLogStart + sessionLogMarker.length + 1;
    const newEntry = '\n' + generateSessionLogEntry(categories) + '\n';
    content = content.substring(0, insertPoint) + newEntry + content.substring(insertPoint);
  }

  // Update timestamp
  const timestampRegex = /> \*\*Last Updated:\*\* .+/;
  const newTimestamp = `> **Last Updated:** ${new Date().toISOString()} by trinity-sync`;
  content = content.replace(timestampRegex, newTimestamp);

  await writeFile(contextPath, content);
  return true;
}

async function main() {
  const repo = process.argv[2];
  const contextPath = process.argv[3] || 'AI_CONTEXT.md';
  const token = process.env.GITHUB_TOKEN;

  if (!repo || !token) {
    console.error('Usage: GITHUB_TOKEN=xxx node trinity-sync.mjs owner/repo [AI_CONTEXT.md path]');
    process.exit(1);
  }

  console.log('🔄 Trinity Sync - Fetching GitHub data...');

  try {
    const issues = await fetchGitHubIssues(repo, token);
    console.log(`   Found ${issues.length} issues`);

    const categories = categorizeIssues(issues);
    console.log(`   Blocked: ${categories.blocked.length}`);
    console.log(`   In Progress: ${categories.inProgress.length}`);
    console.log(`   Needs Review: ${categories.needsReview.length}`);
    console.log(`   Recently Closed: ${categories.recentlyClosed.length}`);

    if (existsSync(contextPath)) {
      await updateAIContext(contextPath, categories);
      console.log(`\n✅ Updated ${contextPath}`);
    } else {
      console.log(`\n⚠️  ${contextPath} not found. Printing summary instead:\n`);
      console.log(generateSprintStatusTable(categories));
      console.log(generateBlockersSummary(categories));
    }

    // Output for piping to other tools
    console.log('\n📊 Summary JSON:');
    console.log(JSON.stringify({
      blocked: categories.blocked.length,
      inProgress: categories.inProgress.length,
      needsReview: categories.needsReview.length,
      recentlyClosed: categories.recentlyClosed.length,
      timestamp: new Date().toISOString(),
    }, null, 2));

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
