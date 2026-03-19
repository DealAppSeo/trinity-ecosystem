#!/usr/bin/env node
/**
 * BOOTSTRAP WRAPPER FOR RAILWAY DEPLOYMENTS
 * Railway's dashboard start command for agents is still pointed to `node scripts/run-agent.js`.
 * Since FIX-002 migrated the system to run-agent.ts, this file bridges the gap by proxying
 * the command to tsx.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const scriptPath = path.resolve(__dirname, 'run-agent.ts');

console.log(`[BOOTSTRAP] Redirecting execution to: npx tsx scripts/run-agent.ts ${args.join(' ')}`);

const result = spawnSync('npx', ['tsx', scriptPath, ...args], { 
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32' // Required for npx on Windows
});

if (result.error) {
  console.error(`[BOOTSTRAP ERROR] Failed to spawn tsx:`, result.error);
  process.exit(1);
}

process.exit(result.status || 0);
