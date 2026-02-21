/**
 * Trinity Context Health Check
 * 
 * Detects "Context Drift" between Git state and AI_CONTEXT.md.
 * Run before starting work to ensure context is accurate.
 * 
 * Usage:
 *   GITHUB_TOKEN=xxx node verify-context.mjs owner/repo
 */

import { readFile } from 'fs/promises';
import { execSync } from 'child_process';

const HEALTH_CHECKS = [];
const WARNINGS = [];
const ERRORS = [];

function addCheck(name, passed, details = '') {
  HEALTH_CHECKS.push({ name, passed, details });
  if (!passed) {
    if (details.includes('CRITICAL')) {
      ERRORS.push(`${name}: ${details}`);
    } else {
      WARNINGS.push(`${name}: ${details}`);
    }
  }
}

async function checkGitStatus() {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf-8' });
    const uncommitted = status.trim().split('\n').filter(l => l.length > 0);
    
    if (uncommitted.length === 0) {
      addCheck('Git Status', true, 'Working directory clean');
    } else if (uncommitted.length < 5) {
      addCheck('Git Status', false, `${uncommitted.length} uncommitted changes`);
    } else {
      addCheck('Git Status', false, `CRITICAL: ${uncommitted.length} uncommitted changes`);
    }
  } catch (err) {
    addCheck('Git Status', false, 'CRITICAL: Not a git repository');
  }
}

async function checkContextFreshness(contextPath) {
  try {
    const content = await readFile(contextPath, 'utf-8');
    
    // Check timestamp
    const timestampMatch = content.match(/Last Updated:\*\* ([^\n]+)/);
    if (timestampMatch) {
      const lastUpdate = new Date(timestampMatch[1]);
      const hoursSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceUpdate < 4) {
        addCheck('Context Freshness', true, `Updated ${hoursSinceUpdate.toFixed(1)} hours ago`);
      } else if (hoursSinceUpdate < 24) {
        addCheck('Context Freshness', false, `Stale: ${hoursSinceUpdate.toFixed(1)} hours since update`);
      } else {
        addCheck('Context Freshness', false, `CRITICAL: ${Math.floor(hoursSinceUpdate / 24)} days since update`);
      }
    } else {
      addCheck('Context Freshness', false, 'No timestamp found in AI_CONTEXT.md');
    }
  } catch (err) {
    addCheck('Context Freshness', false, `CRITICAL: Cannot read ${contextPath}`);
  }
}

async function checkGitHubSync(repo, token, contextPath) {
  try {
    const [owner, repoName] = repo.split('/');
    const url = `https://api.github.com/repos/${owner}/${repoName}/issues?state=open&labels=blocked`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });
    
    const blockedIssues = await response.json();
    const content = await readFile(contextPath, 'utf-8');
    
    // Check if blocked issues are reflected in context
    let missingFromContext = 0;
    for (const issue of blockedIssues) {
      if (!content.includes(`#${issue.number}`)) {
        missingFromContext++;
      }
    }
    
    if (missingFromContext === 0) {
      addCheck('GitHub Sync', true, 'All blocked issues reflected in context');
    } else {
      addCheck('GitHub Sync', false, `${missingFromContext} blocked issues not in AI_CONTEXT.md`);
    }
  } catch (err) {
    addCheck('GitHub Sync', false, `Cannot verify: ${err.message}`);
  }
}

async function checkSessionLogRecent(contextPath) {
  try {
    const content = await readFile(contextPath, 'utf-8');
    
    // Find most recent session log entry
    const sessionLogMatch = content.match(/### (\d{4}-\d{2}-\d{2})/g);
    
    if (sessionLogMatch && sessionLogMatch.length > 0) {
      const mostRecent = sessionLogMatch[0].replace('### ', '');
      const logDate = new Date(mostRecent);
      const daysSince = (Date.now() - logDate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSince < 1) {
        addCheck('Session Log', true, `Last entry: ${mostRecent}`);
      } else {
        addCheck('Session Log', false, `Last entry ${Math.floor(daysSince)} days ago`);
      }
    } else {
      addCheck('Session Log', false, 'No session log entries found');
    }
  } catch (err) {
    addCheck('Session Log', false, `Cannot check: ${err.message}`);
  }
}

async function checkBranchSync() {
  try {
    execSync('git fetch origin main --quiet', { encoding: 'utf-8' });
    const behindAhead = execSync('git rev-list --left-right --count origin/main...HEAD', { encoding: 'utf-8' });
    const [behind, ahead] = behindAhead.trim().split('\t').map(Number);
    
    if (behind === 0 && ahead === 0) {
      addCheck('Branch Sync', true, 'Up to date with origin/main');
    } else if (behind > 0) {
      addCheck('Branch Sync', false, `${behind} commits behind origin/main - pull needed`);
    } else {
      addCheck('Branch Sync', true, `${ahead} commits ahead (ready to push)`);
    }
  } catch (err) {
    addCheck('Branch Sync', false, `Cannot check: ${err.message}`);
  }
}

function printReport() {
  console.log('\n🔍 Trinity Context Health Check');
  console.log('='.repeat(50));
  
  for (const check of HEALTH_CHECKS) {
    const icon = check.passed ? '✅' : '⚠️';
    console.log(`${icon} ${check.name}: ${check.details}`);
  }
  
  console.log('\n' + '='.repeat(50));
  
  const passed = HEALTH_CHECKS.filter(c => c.passed).length;
  const total = HEALTH_CHECKS.length;
  
  if (ERRORS.length > 0) {
    console.log(`\n🚨 CRITICAL ISSUES (${ERRORS.length}):`);
    ERRORS.forEach(e => console.log(`   - ${e}`));
  }
  
  if (WARNINGS.length > 0) {
    console.log(`\n⚠️  WARNINGS (${WARNINGS.length}):`);
    WARNINGS.forEach(w => console.log(`   - ${w}`));
  }
  
  console.log(`\n📊 Health Score: ${passed}/${total} checks passed`);
  
  if (ERRORS.length > 0) {
    console.log('\n❌ Context health: CRITICAL - fix errors before proceeding');
    return false;
  } else if (WARNINGS.length > 0) {
    console.log('\n⚠️  Context health: DEGRADED - consider fixing warnings');
    return true;
  } else {
    console.log('\n✅ Context health: GOOD - ready to proceed');
    return true;
  }
}

async function main() {
  const repo = process.argv[2];
  const contextPath = process.argv[3] || 'AI_CONTEXT.md';
  const token = process.env.GITHUB_TOKEN;
  
  console.log('🔍 Running context health checks...\n');
  
  await checkGitStatus();
  await checkBranchSync();
  await checkContextFreshness(contextPath);
  await checkSessionLogRecent(contextPath);
  
  if (repo && token) {
    await checkGitHubSync(repo, token, contextPath);
  } else {
    addCheck('GitHub Sync', false, 'Skipped - no repo/token provided');
  }
  
  const healthy = printReport();
  process.exit(healthy ? 0 : 1);
}

main();
