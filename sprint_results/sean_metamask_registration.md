# MetaMask Agent Registration (ERC-8004)

**Goal:** Bind the 5 missing agents (ORCH, W3C, SHOFET, SOPHIA, CHESED) to the ERC-8004 Identity Registry on Base Sepolia.

1. **Extract Wallet Addresses from Railway**
   Since the Railway CLI is not authenticated locally, log into the Railway Dashboard.
   Go to the `trinity-ecosystem` project -> Variables.
   Copy the respective wallet addresses for the 5 agents (or extract their private keys and import to MetaMask).

2. **Connect to Base Sepolia via MetaMask**
   Ensure your MetaMask is on the Base Sepolia network and funded with testnet ETH.

3. **Call `registerAgent`**
   Go to BaseScan (Sepolia) -> Search for Identity Registry `0x8004A818BFB912233c491871b3d84c89A494BD9e` -> Contract -> Write as Proxy (or Write Contract).
   Connect your Web3 Wallet (MetaMask).

   You will call `registerAgent(address _agentAddress)` for each of the 5 agents:
   - ORCH
   - W3C
   - SHOFET
   - SOPHIA
   - CHESED

   *(If you are using `cast` locally instead of metamask, the command is:)*
   `cast send 0x8004A818BFB912233c491871b3d84c89A494BD9e "registerAgent(address)" <AGENT_ADDRESS> --rpc-url <BASE_SEPOLIA_RPC> --private-key <YOUR_PRIVATE_KEY>`
