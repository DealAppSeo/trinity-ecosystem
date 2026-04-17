/**
 * scripts/broadcast.js
 * Broadcasts pending validation_artifacts to ERC-8004 Validation Registry on Base Sepolia.
 * Local Node.js script — not a network call to an external service.
 *
 * Usage: node scripts/broadcast.js
 */
const { ethers } = require('ethers');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

// Load .env.local manually
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

// Config
const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
const DEPLOYER_KEY = process.env.TRINITY_DEPLOYER_PRIVATE_KEY || process.env.TRINITY_DEPLOYER;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qnnpjhlxljtqyigedwkb.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VAL_REGISTRY = '0x8004Cb1BF31DAf7788923b405b754f57acEB4272';
const VERITAS_ADDRESS = '0x09A8F5F4634d04f39f3a2c0A85c7177aacCEe883';
const SOPHIA_TOKEN_ID = 3747n;

// Minimal ABI for validationRequest
const VALIDATION_REGISTRY_ABI = [
  'function validationRequest(address validatorAddress, uint256 agentId, string requestURI, bytes32 requestHash) external',
];

async function main() {
  if (!DEPLOYER_KEY) {
    console.error('ERROR: TRINITY_DEPLOYER_PRIVATE_KEY not set in .env.local');
    process.exit(1);
  }
  if (!SUPABASE_KEY) {
    console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY not set in .env.local');
    process.exit(1);
  }

  const privateKey = DEPLOYER_KEY.startsWith('0x') ? DEPLOYER_KEY : '0x' + DEPLOYER_KEY;
  const provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(VAL_REGISTRY, VALIDATION_REGISTRY_ABI, wallet);

  console.log('Deployer:', wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log('Balance:', ethers.formatEther(balance), 'ETH');

  // Query Supabase for pending artifacts
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data: pending, error } = await supabase
    .from('validation_artifacts')
    .select('id, decision_id')
    .is('tx_hash', null)
    .order('id', { ascending: true })
    .limit(10);

  if (error) {
    console.error('Supabase query error:', error);
    process.exit(1);
  }

  if (!pending || pending.length === 0) {
    console.log('No pending artifacts.');
    return;
  }

  console.log(`Found ${pending.length} pending artifacts. Broadcasting...`);

  // Fetch decision details for each artifact
  const decisionIds = pending.map((p) => p.decision_id);
  const { data: decisions } = await supabase
    .from('trade_execution_log')
    .select('id, unity_score, reason, created_at')
    .in('id', decisionIds);
  const decMap = new Map(decisions.map((d) => [d.id, d]));

  let succeeded = 0;
  let failed = 0;
  const results = [];

  for (const artifact of pending) {
    const dec = decMap.get(artifact.decision_id);
    if (!dec) {
      console.log(`[SKIP] Artifact ${artifact.id}: no matching decision`);
      continue;
    }

    try {
      const unity = Number(dec.unity_score).toFixed(4);
      const reason = dec.reason || 'Constitutional refusal';
      const ts = Math.floor(new Date(dec.created_at).getTime() / 1000);

      // Build request URI (data URI with proof metadata)
      const payload = JSON.stringify({
        type: 'constitutional-refusal',
        decision_id: dec.id,
        unity_score: unity,
        reason: reason.slice(0, 200),
      });
      const requestURI = 'data:application/json;base64,' + Buffer.from(payload).toString('base64');

      // Compute requestHash
      const requestHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['uint256', 'string', 'string', 'uint256'],
          [BigInt(dec.id), unity, reason.slice(0, 200), BigInt(ts)]
        )
      );

      // Call validationRequest
      const tx = await contract.validationRequest(
        VERITAS_ADDRESS,
        SOPHIA_TOKEN_ID,
        requestURI,
        requestHash
      );
      console.log(`[${artifact.id}] TX: ${tx.hash} — waiting...`);
      const receipt = await tx.wait();

      if (receipt.status === 1) {
        // Update Supabase
        const { error: updateErr } = await supabase
          .from('validation_artifacts')
          .update({ tx_hash: tx.hash })
          .eq('id', artifact.id);

        if (updateErr) {
          console.error(`[${artifact.id}] DB update failed:`, updateErr.message);
        } else {
          succeeded++;
          results.push({ id: artifact.id, tx: tx.hash });
          console.log(`[${artifact.id}] ✓ SUCCESS gas=${receipt.gasUsed}`);
        }
      } else {
        failed++;
        console.log(`[${artifact.id}] ✗ FAILED status=${receipt.status}`);
      }

      // Small delay between txs
      await new Promise((r) => setTimeout(r, 1500));
    } catch (e) {
      failed++;
      console.error(`[${artifact.id}] ERROR:`, e.message?.slice(0, 200) || e);
      // If out of gas, stop
      if (e.message && (e.message.includes('insufficient funds') || e.message.includes('exceeds'))) {
        console.error('Out of gas — stopping.');
        break;
      }
    }
  }

  console.log('\n=== RESULTS ===');
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${pending.length}`);
  console.log('RESULT_JSON:' + JSON.stringify({ succeeded, failed, total: pending.length, results }));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('FATAL:', e);
    process.exit(1);
  });
