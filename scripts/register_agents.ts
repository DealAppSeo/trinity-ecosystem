import { createWalletClient, createPublicClient, http, parseAbi, keccak256, encodePacked } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { createClient } from '@supabase/supabase-js';

const IDENTITY_REGISTRY_ADDRESS = '0x8004A818BFB912233c491871b3d84c89A494BD9e';

const IDENTITY_REGISTRY_ABI = parseAbi([
    'function register(string calldata agentURI) external returns (uint256 agentId)',
    'function setAgentWallet(uint256 agentId, address wallet, bytes calldata proof) external',
    'function tokenURI(uint256 tokenId) external view returns (string)',
]);

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function registerAgent(
    name: string,
    privateKey: `0x${string}`,
    registrationURI: string
) {
    if (privateKey === '0x...') {
        console.warn(`Skipping ${name}: No private key provided.`);
        return;
    }

    const account = privateKeyToAccount(privateKey);
    const client = createWalletClient({ account, chain: baseSepolia, transport: http() });
    const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });

    console.log(`[Registration] Registering ${name} with URI: ${registrationURI}`);

    try {
        // 1. ERC-8004 register()
        const registerHash = await client.writeContract({
            address: IDENTITY_REGISTRY_ADDRESS,
            abi: IDENTITY_REGISTRY_ABI,
            functionName: 'register',
            args: [registrationURI],
        });

        console.log(`[Registration] Transaction sent: ${registerHash}`);
        const receipt = await publicClient.waitForTransactionReceipt({ hash: registerHash });

        // Extract agentId from Transfer event (indexed param 3)
        const agentId = BigInt(receipt.logs[0].topics[3] ?? '0x0');
        console.log(`[Registration] ${name} ID: ${agentId}`);

        // 2. Build EIP-712 proof for setAgentWallet
        const domain = {
            name: 'ERC-8004 Identity Registry',
            version: '1',
            chainId: 84532,
            verifyingContract: IDENTITY_REGISTRY_ADDRESS,
        };

        const types = {
            AgentWalletLink: [
                { name: 'agentId', type: 'uint256' },
                { name: 'wallet', type: 'address' },
            ],
        };

        const proof = await account.signTypedData({
            domain, types,
            primaryType: 'AgentWalletLink',
            message: { agentId, wallet: account.address },
        });

        // 3. Link Wallet
        const setWalletHash = await client.writeContract({
            address: IDENTITY_REGISTRY_ADDRESS,
            abi: IDENTITY_REGISTRY_ABI,
            functionName: 'setAgentWallet',
            args: [agentId, account.address, proof as `0x${string}`],
        });

        await publicClient.waitForTransactionReceipt({ hash: setWalletHash });
        console.log(`[Registration] ${name} wallet linked: ${account.address}`);

        // 4. Supabase Update
        await supabase.from('agent_registry').upsert({
            agent_name: name,
            erc8004_agent_id: Number(agentId),
            erc8004_chain: 'base-sepolia',
            registration_uri: registrationURI,
            wallet_address: account.address,
            wallet_verified: true,
            registered_at: new Date().toISOString(),
        });

        // 5. Initialize RepID
        await supabase.from('agent_repid_score').upsert({
            agent_name: name,
            current_repid: 5000,
            calculated_at: new Date().toISOString()
        });

        return agentId;
    } catch (error) {
        console.error(`[Registration] Failed for ${name}:`, error);
    }
}

async function main() {
    const agents = [
        { name: 'NEXUS', key: process.env.NEXUS_PRIVATE_KEY as `0x${string}` },
        { name: 'VERITAS', key: process.env.VERITAS_PRIVATE_KEY as `0x${string}` },
        { name: 'APM', key: process.env.APM_PRIVATE_KEY as `0x${string}` },
        { name: 'SOPHIA', key: process.env.SOPHIA_PRIVATE_KEY as `0x${string}` },
    ];

    for (const agent of agents) {
        await registerAgent(
            agent.name,
            agent.key,
            `https://aitrinitysymphony.com/agents/${agent.name}/registration.json`
        );
    }
}

main().catch(console.error);
