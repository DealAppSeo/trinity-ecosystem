import { createWalletClient, createPublicClient, http, parseAbi, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const RPC_URL = process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org';
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;

if (!PRIVATE_KEY) {
    console.error('ERROR: DEPLOYER_PRIVATE_KEY missing in .env');
    process.exit(1);
}

const account = privateKeyToAccount(PRIVATE_KEY);

const client = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(RPC_URL),
});

const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(RPC_URL),
});

// ABI and Bytecode (In a real setup, these would be imported from artifacts/)
const abi = parseAbi([
    'constructor()',
    'function registerAgent(string name, address wallet)',
    'function syncReputation(string name, uint256 newReputation)',
    'function getAgent(string name) view returns (address, uint256, bool)',
    'event AgentRegistered(string name, address wallet)',
    'event ReputationSynced(string name, uint256 newReputation)'
]);

async function deploy() {
    console.log(`[W3C] 🚀 Deploying TrinityIdentityAdapter to Base Sepolia...`);
    console.log(`[W3C] 👤 Deployer: ${account.address}`);

    // Bytecode placeholder - user needs to compile the .sol file
    // To get this: solcjs --bin contracts/TrinityIdentityAdapter.sol
    const bytecode = process.env.CONTRACT_BYTECODE as `0x${string}`;

    if (!bytecode) {
        console.warn('WARNING: CONTRACT_BYTECODE missing. Preparing deployment transaction (dry run)...');
        // return;
    }

    try {
        const hash = await client.deployContract({
            abi,
            bytecode: bytecode || '0x', // Placeholder
            account,
        });

        console.log(`[W3C] 📝 Deployment Hash: ${hash}`);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        console.log(`[W3C] ✅ Contract Deployed at: ${receipt.contractAddress}`);

        // Save to .env.local
        const envPath = path.resolve(process.cwd(), '.env.local');
        fs.appendFileSync(envPath, `\nNEXT_PUBLIC_ERC8004_IDENTITY_REGISTRY=${receipt.contractAddress}\n`);
    } catch (e) {
        console.error(`[W3C] ❌ Deployment failed:`, e);
    }
}

deploy();
