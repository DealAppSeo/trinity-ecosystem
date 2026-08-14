/**
 * Register 4 TrustTrader agents on ERC-8004 Identity Registry (Base Sepolia)
 */
const { createWalletClient, createPublicClient, http, decodeEventLog } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { baseSepolia } = require('viem/chains');
const fs = require('fs');

// This key signs registrations against the canonical ERC-8004 Identity
// Registry, so whoever holds it can transfer the agent identities it owns and
// rewrite their on-chain metadata. It was previously a literal in this file and
// is therefore in git history — see docs/KEY-ROTATION.md. Never inline it again.
const DEPLOYER_KEY = process.env.TRINITY_DEPLOYER_PRIVATE_KEY;
if (!DEPLOYER_KEY) {
  console.error(
    'TRINITY_DEPLOYER_PRIVATE_KEY is not set.\n' +
      'This script writes to the ERC-8004 Identity Registry on Base Sepolia and will not\n' +
      'run without an explicitly supplied signer. Export the key for this shell only.'
  );
  process.exit(1);
}
const CONTRACT = '0x8004A818BFB912233c491871b3d84c89A494BD9e';

const abi = JSON.parse(fs.readFileSync('lib/trusttrader/IdentityRegistry.json', 'utf8'));
const account = privateKeyToAccount(DEPLOYER_KEY);

const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(),
});

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

const AGENTS = [
  {
    name: 'SOPHIA',
    description: 'Constitutional trading agent. Pythagorean Comma veto. 0% drawdown.',
    repid: { score: 6277, earned: 6277, perceived: 6180 },
    email: 'sophia@trusttrader.dev',
  },
  {
    name: 'RAVEN',
    description: 'Market intelligence agent. Signal correlation and pattern detection across 13 Circle of Fifths signals.',
    repid: { score: 2100, earned: 2100, perceived: 2000 },
    email: 'raven@trusttrader.dev',
  },
  {
    name: 'ATLAS',
    description: 'Portfolio risk agent. Drawdown prevention and position sizing via Unity Score threshold.',
    repid: { score: 1800, earned: 1800, perceived: 1700 },
    email: 'atlas@trusttrader.dev',
  },
  {
    name: 'GUARDIAN',
    description: 'Constitutional compliance agent. EIP-712 signature verification and Merkle proof auditing.',
    repid: { score: 1400, earned: 1400, perceived: 1300 },
    email: 'guardian@trusttrader.dev',
  },
];

function buildAgentCardURI(agent) {
  const card = {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: agent.name,
    description: agent.description,
    endpoints: [
      { name: 'A2A', endpoint: `https://trusttrader.dev/agents/${agent.name.toLowerCase()}/.well-known/agent-card.json` },
      { name: 'MCP', endpoint: `https://trusttrader.dev/mcp/${agent.name.toLowerCase()}` },
    ],
    supportedTrust: ['reputation', 'zkp-stark', 'conservatorship'],
  };
  // Use data URI for on-chain storage
  return 'data:application/json;base64,' + Buffer.from(JSON.stringify(card)).toString('base64');
}

async function registerAgent(agent) {
  const uri = buildAgentCardURI(agent);
  console.log(`\n[${agent.name}] Registering with URI (${uri.length} chars)...`);

  try {
    const hash = await walletClient.writeContract({
      address: CONTRACT,
      abi,
      functionName: 'register',
      args: [uri],
    });
    console.log(`[${agent.name}] TX hash: ${hash}`);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`[${agent.name}] Status: ${receipt.status} | Gas: ${receipt.gasUsed.toString()}`);

    // Extract token ID from Transfer event (ERC-721)
    let tokenId = null;
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === 'Transfer') {
          tokenId = decoded.args.tokenId.toString();
          break;
        }
      } catch (e) {
        // Not a matching event, skip
      }
    }

    if (!tokenId && receipt.logs.length > 0) {
      // Fallback: parse raw topic[3] as tokenId
      const lastLog = receipt.logs[receipt.logs.length - 1];
      if (lastLog.topics.length >= 4) {
        tokenId = BigInt(lastLog.topics[3]).toString();
      }
    }

    console.log(`[${agent.name}] Token ID: ${tokenId}`);
    console.log(`[${agent.name}] Basescan: https://sepolia.basescan.org/tx/${hash}`);

    return { agent, hash, tokenId, status: receipt.status };
  } catch (e) {
    console.error(`[${agent.name}] ERROR: ${e.message}`);
    return { agent, hash: null, tokenId: null, status: 'failed', error: e.message };
  }
}

async function main() {
  console.log('=== ERC-8004 Agent Registration ===');
  console.log(`Contract: ${CONTRACT}`);
  console.log(`Deployer: ${account.address}`);

  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Balance: ${Number(balance) / 1e18} ETH`);

  const results = [];
  for (const agent of AGENTS) {
    const result = await registerAgent(agent);
    results.push(result);
    // Small delay between registrations
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n=== REGISTRATION SUMMARY ===');
  for (const r of results) {
    console.log(JSON.stringify({
      name: r.agent.name,
      email: r.agent.email,
      repid_score: r.agent.repid.score,
      repid_earned: r.agent.repid.earned,
      repid_perceived: r.agent.repid.perceived,
      token_id: r.tokenId,
      tx_hash: r.hash,
      status: r.status,
    }));
  }
}

main().catch(console.error);
