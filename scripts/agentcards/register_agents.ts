
import { createWalletClient, createPublicClient, http, keccak256, encodePacked } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
);

const IDENTITY_REGISTRY_ADDRESS = '0x8004A818BFB912233c491871b3d84c89A494BD9e';
const IDENTITY_REGISTRY_ABI = [
    {
        name: 'register',
        type: 'function',
        inputs: [{ name: 'agentURI', type: 'string' }],
        outputs: [{ name: 'agentId', type: 'uint256' }],
        stateMutability: 'nonpayable',
    },
    {
        name: 'setAgentWallet',
        type: 'function',
        inputs: [
            { name: 'agentId', type: 'uint256' },
            { name: 'wallet', type: 'address' },
            { name: 'proof', type: 'bytes' },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
];

const TRINITY_AGENTS = [
    'VERITAS', 'TORCH', 'NEXUS', 'HDM', 'APM', 'MEL', 'ANTIGRAV', 'GCM'
];

async function registerAllAgents() {
    const privateKey = process.env.TRINITY_DEPLOYER_PRIVATE_KEY as `0x${string}`;
    if (!privateKey) {
        console.error('❌ TRINITY_DEPLOYER_PRIVATE_KEY missing in .env.local');
        return;
    }

    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http() });
    const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });

    console.log(`🚀 Starting registration for ${TRINITY_AGENTS.length} agents using ${account.address}...`);

    for (const agentName of TRINITY_AGENTS) {
        console.log(`\n⏳ Registering ${agentName}...`);

        const registrationUri = `https://aitrinitysymphony.com/agents/${agentName.toLowerCase()}/registration.json`;

        try {
            // 1. Send register transaction
            const { request } = await publicClient.simulateContract({
                account,
                address: IDENTITY_REGISTRY_ADDRESS,
                abi: IDENTITY_REGISTRY_ABI,
                functionName: 'register',
                args: [registrationUri],
            });

            const hash = await walletClient.writeContract(request);
            console.log(`✅ Transaction sent: ${hash}`);

            // 2. Wait for confirmation and find Transfer event (ERC-721) to get agentId
            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            // In ERC-8004, the register() function returns the agentId, 
            // but viem writeContract doesn't return value. We extract from logs.
            // EIP-8004 uses ERC-721, so we look for Transfer(0x0, owner, tokenId)
            const transferLog = receipt.logs.find(log =>
                log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' // Transfer
            );

            if (!transferLog) throw new Error('Transfer event not found in receipt');

            const agentId = BigInt(transferLog.topics[3]!).toString();
            console.log(`✨ Registered ${agentName} with agentId: ${agentId}`);

            // 3. Update Supabase
            const { error: dbError } = await supabase
                .from('agent_registry')
                .update({
                    erc8004_agent_id: parseInt(agentId),
                    registered_at: new Date().toISOString(),
                    wallet_address: account.address // Defaulting to deployer for now
                })
                .eq('agent_name', agentName);

            if (dbError) throw dbError;
            console.log(`💾 Supabase updated for ${agentName}`);

            // 4. Link Wallet (EIP-712 Proof)
            console.log(`🔗 Linking wallet for ${agentName}...`);

            const domain = {
                name: 'ERC-8004 Identity Registry',
                version: '1',
                chainId: 84532,
                verifyingContract: IDENTITY_REGISTRY_ADDRESS as `0x${string}`,
            };

            const types = {
                AgentWallet: [
                    { name: 'agentId', type: 'uint256' },
                    { name: 'wallet', type: 'address' },
                ],
            };

            const message = {
                agentId: BigInt(agentId),
                wallet: account.address,
            };

            const proof = await walletClient.signTypedData({
                account,
                domain,
                types,
                primaryType: 'AgentWallet',
                message,
            });

            const { request: linkRequest } = await publicClient.simulateContract({
                account,
                address: IDENTITY_REGISTRY_ADDRESS,
                abi: IDENTITY_REGISTRY_ABI,
                functionName: 'setAgentWallet',
                args: [BigInt(agentId), account.address, proof],
            });

            const linkHash = await walletClient.writeContract(linkRequest);
            await publicClient.waitForTransactionReceipt({ hash: linkHash });

            await supabase
                .from('agent_registry')
                .update({ wallet_verified: true })
                .eq('agent_name', agentName);

            console.log(`🎯 Wallet linked successfully for ${agentName}`);

        } catch (err) {
            console.error(`❌ Error registering ${agentName}:`, err.message);
        }
    }

    console.log('\n🏁 Registration process complete.');
}

registerAllAgents();
