# Trinity Symphony: Required Environment Variables

To ensure full hackathon readiness, the following environment variables must be configured in your environment (e.g., Railway, Vercel, .env).

## Agent Wallets (Base Sepolia)
Required for all 12 agents to sign registration receipts and update reputation on-chain.
- `APM_PRIVATE_KEY`
- `GCM_PRIVATE_KEY`
- `HDM_PRIVATE_KEY`
- `MEL_PRIVATE_KEY`
- `NEXUS_PRIVATE_KEY`
- `TORCH_PRIVATE_KEY`
- `VERITAS_PRIVATE_KEY`
- `CHESED_PRIVATE_KEY`
- `SOPHIA_PRIVATE_KEY`
- `W3C_PRIVATE_KEY`
- `ORCH_PRIVATE_KEY`
- `SHOFET_PRIVATE_KEY`

## Web3 Infrastructure
- `NEXT_PUBLIC_ERC8004_IDENTITY_REGISTRY`: `0x8004A818BFB912233c491871b3d84c89A494BD9e` (Base Sepolia)
- `Base_Sepolia_RPC_URL`: Endpoint for blockchain interactions.

## Trading (Coinbase Advanced Trade)
Replacement for Alpaca.
- `COINBASE_API_KEY`
- `COINBASE_API_SECRET`

## Database & Backend (Supabase)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`: Required for agent backend operations (bypassing RLS).

## LLM Providers
At least one "Elite" provider (OpenAI/Anthropic) is recommended for orchestration.
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `DEEPSEEK_API_KEY`
- `SILICONFLOW_API_KEY`

## Social & Notifications
- `TELEGRAM_BOT_TOKEN`: For swarm control and trade approvals.
- `TELEGRAM_CHAT_ID`: Destination for alerts.

## Content & Storage
- `PINATA_API_KEY`: For IPFS metadata storage.
- `PINATA_SECRET_API_KEY`
- `GITHUB_TOKEN`: For agent code maintenance tasks.
