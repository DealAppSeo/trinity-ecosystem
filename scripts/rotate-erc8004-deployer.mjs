#!/usr/bin/env node
//
// rotate-erc8004-deployer.mjs — move ERC-8004 agent identities off a
// compromised signer.
//
// RUN THIS ON YOUR OWN MACHINE. Not in a CI job, not in an agent session, not
// anywhere that keeps a transcript. The compromised key must be supplied by
// environment variable and it is never printed, logged, or written to disk by
// this script. The reason the key is exposed at all is that it once appeared in
// a place that keeps records; do not repeat that while fixing it.
//
// WHAT IT DOES
//   1. Derives the compromised address from the key and confirms it is the one
//      you expect (you pass the expectation; a mismatch aborts).
//   2. Confirms that address currently owns each token you name.
//   3. Confirms the destination is not the compromised address, is not zero,
//      and is not a contract that would trap an ERC-721.
//   4. safeTransferFrom for each token, one at a time, waiting for each.
//   5. Re-reads ownerOf for each and reports.
//
// DRY RUN IS THE DEFAULT. Nothing is broadcast without --execute. Steps 1-3
// still run, so a dry run is a real pre-flight rather than a no-op.
//
// USAGE
//   export TRINITY_COMPROMISED_KEY=0x...        # the leaked signer
//   node scripts/rotate-erc8004-deployer.mjs \
//     --tokens 1,2,3 \
//     --to 0xYourFreshSigner \
//     --expect-from 0xTheCompromisedAddress
//   # review the plan, then re-run with --execute
//
// GENERATING THE FRESH SIGNER — do this first, and keep it off this repo:
//   node -e "const w=require('ethers').Wallet.createRandom(); \
//            console.log('address:', w.address); \
//            console.log('key:', w.privateKey)"
//   Store the key in your deployment secret store as TRINITY_DEPLOYER_PRIVATE_KEY.
//   Do NOT commit it, do not paste it into an issue, chat, or PR.
//
// AFTERWARDS
//   The compromised key remains in git history forever and cannot be removed by
//   any commit. That is fine once it owns nothing: it becomes a key to an empty
//   account. Rotation is what makes the history entry harmless, not deletion.

import { ethers } from 'ethers';

const REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e';
const RPC = process.env.BASE_SEPOLIA_RPC ?? 'https://sepolia.base.org';
const CHAIN_ID = 84532n;

const ABI = [
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
  'function supportsInterface(bytes4) view returns (bool)',
];

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const EXECUTE = process.argv.includes('--execute');

function die(msg) {
  console.error(`\nABORT: ${msg}\n`);
  process.exit(1);
}

const key = process.env.TRINITY_COMPROMISED_KEY;
if (!key) die('TRINITY_COMPROMISED_KEY is not set. Export it in this shell only.');

const to = arg('to');
const expectFrom = arg('expect-from');
const tokens = (arg('tokens') ?? '')
  .split(',')
  .map((t) => t.trim())
  .filter(Boolean);

if (!to) die('--to <address> is required (the fresh signer).');
if (!expectFrom) die('--expect-from <address> is required. Naming the address you expect turns a wrong key into an abort instead of a transfer to nowhere.');
if (!tokens.length) die('--tokens <id,id,...> is required. Token ids are deliberately not hardcoded here so this file does not restate which identities are affected.');

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(key, provider);
const registry = new ethers.Contract(REGISTRY, ABI, wallet);

// --- pre-flight: LOCAL CHECKS FIRST ------------------------------------------
//
// Everything that needs no network runs before anything that does. A wrong key
// or a typo'd destination should abort with one clear line, not surface as a
// connection stack trace that hides the real problem — which is exactly what
// this script did on its first run.

if (!ethers.isAddress(to)) die(`--to is not a valid address: ${to}`);
if (!ethers.isAddress(expectFrom)) die(`--expect-from is not a valid address: ${expectFrom}`);
if (wallet.address.toLowerCase() !== expectFrom.toLowerCase()) {
  // Never print the key or any part of it — only the derived address.
  die(`the supplied key derives ${wallet.address}, but --expect-from is ${expectFrom}.`);
}
if (to.toLowerCase() === wallet.address.toLowerCase()) {
  die('--to is the compromised address itself. That would be a no-op dressed as a rotation.');
}
if (to === ethers.ZeroAddress) die('--to is the zero address; that burns the identities.');

// --- pre-flight: NETWORK -----------------------------------------------------

/** Any RPC failure must read as "cannot reach the chain", never as a crash. */
async function rpc(label, fn) {
  try {
    return await fn();
  } catch (err) {
    die(
      `${label} failed against ${RPC}: ${err.shortMessage ?? err.message}\n` +
        `  If this host cannot reach Base Sepolia, set BASE_SEPOLIA_RPC to one it can.\n` +
        `  Nothing was broadcast.`
    );
  }
}

const net = await rpc('network detection', () => provider.getNetwork());
if (net.chainId !== CHAIN_ID) {
  die(`RPC is chain ${net.chainId}, expected Base Sepolia (${CHAIN_ID}). Wrong network moves nothing, or moves the wrong thing.`);
}

// A contract destination that does not implement onERC721Received would revert
// under safeTransferFrom — better to say so now than to discover it mid-run.
const code = await rpc('destination code lookup', () => provider.getCode(to));
if (code !== '0x') {
  console.warn(
    `\nWARNING: ${to} is a contract. safeTransferFrom will revert unless it ` +
    `implements onERC721Received. Verify before using --execute.`
  );
}

if (!(await rpc('ERC-721 interface check', () => registry.supportsInterface('0x80ac58cd')))) {
  die(`${REGISTRY} does not report ERC-721 support; safeTransferFrom is not the right call here.`);
}

const balance = await rpc('balance lookup', () => provider.getBalance(wallet.address));
console.log(`\nRotation pre-flight`);
console.log(`  registry     ${REGISTRY}`);
console.log(`  from         ${wallet.address}`);
console.log(`  to           ${to}${code !== '0x' ? '  (CONTRACT)' : ''}`);
console.log(`  gas balance  ${ethers.formatEther(balance)} ETH`);
console.log(`  nonce        ${await rpc('nonce lookup', () => provider.getTransactionCount(wallet.address))}`);

let blocked = false;
for (const id of tokens) {
  let owner;
  try {
    owner = await registry.ownerOf(id);
  } catch (err) {
    console.log(`  token ${id}: ownerOf reverted (${err.shortMessage ?? err.message}) — SKIP`);
    blocked = true;
    continue;
  }
  const mine = owner.toLowerCase() === wallet.address.toLowerCase();
  console.log(`  token ${id}: owner ${owner} ${mine ? '-> transferable' : '-> NOT OWNED BY THIS KEY, will skip'}`);
  if (!mine) blocked = true;
}

if (balance === 0n) {
  die('the compromised account has no gas. Fund it before rotating — a transfer cannot be signed without it.');
}

if (!EXECUTE) {
  console.log(
    `\nDRY RUN — nothing was broadcast.` +
    (blocked ? `\nSome tokens are not transferable by this key (see above); those will be skipped.` : '') +
    `\nRe-run with --execute to perform the transfers.\n`
  );
  process.exit(0);
}

// --- execute -----------------------------------------------------------------

console.log(`\nEXECUTING — each transfer is broadcast and awaited in turn.\n`);
const results = [];
for (const id of tokens) {
  try {
    const owner = await registry.ownerOf(id);
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      results.push({ id, status: 'SKIPPED', detail: `owned by ${owner}` });
      continue;
    }
    // Explicit method signature: safeTransferFrom is overloaded on ERC-721.
    const tx = await registry['safeTransferFrom(address,address,uint256)'](wallet.address, to, id);
    console.log(`  token ${id}: sent ${tx.hash} …`);
    const receipt = await tx.wait();
    results.push({ id, status: receipt.status === 1 ? 'TRANSFERRED' : 'REVERTED', detail: tx.hash });
  } catch (err) {
    results.push({ id, status: 'FAILED', detail: err.shortMessage ?? err.message });
  }
}

// --- verify, by re-reading rather than trusting the receipts -----------------

console.log(`\nPost-transfer ownership (re-read from chain):`);
let allMoved = true;
for (const { id, status, detail } of results) {
  let owner = 'unknown';
  try {
    owner = await registry.ownerOf(id);
  } catch { /* leave as unknown */ }
  const moved = owner.toLowerCase() === to.toLowerCase();
  if (!moved) allMoved = false;
  console.log(`  token ${id}: ${status.padEnd(11)} owner now ${owner} ${moved ? 'OK' : 'NOT AT DESTINATION'}  ${detail}`);
}

console.log(
  allMoved
    ? `\nAll named identities are now held by ${to}.\n` +
      `Next: set TRINITY_DEPLOYER_PRIVATE_KEY to the fresh key in your deployment\n` +
      `secret store, and close autonomous_tasks #73 with the transaction hashes.\n`
    : `\nSome identities did NOT reach the destination. Do not close #73.\n`
);
process.exit(allMoved ? 0 : 1);
