// scripts/agent-card-snippet.ts
// TrustShell Sprint — Created March 26 2026 by Gemini
// INSTRUCTION: Add this snippet to EACH agent's main Express server right before app.listen()

import { createClient } from '@supabase/supabase-js';

// ... existing agent code ...

export function attachAgentCard(app: any) {
  app.get('/.well-known/agent-card.json', async (req: any, res: any) => {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      // We read the agent_name from the environment (e.g. AGENT_NAME=TORCH)
      const agentName = process.env.AGENT_NAME;
      if (!agentName) {
         return res.status(500).json({ error: 'AGENT_NAME environment variable missing' });
      }

      const { data } = await supabase
        .from('agent_kya_registry')
        .select('*')
        .eq('agent_name', agentName)
        .single();

      if (!data) {
        return res.status(404).json({ error: 'Agent not found in registry' });
      }

      // ERC-8004 Compliant Payload
      res.json({
        "@context": "https://w3id.org/agent-card/v1",
        "type": "AgentCard",
        "id": `did:pkh:eip155:84532:${data.agent_id_onchain || 'unregistered'}`,
        "name": data.agent_name,
        "trusted": true,
        "kya_attestation": {
          "status": "verified",
          "repid_score": data.repid_score,
          "repid_tier": data.repid_tier,
          "human_custody_verified": data.human_custody_verified,
          "zkp_proof_cid": data.zkp_proof_cid,
          "registered_at": data.registered_at
        },
        "endpoints": {
          "mcp": "/mcp",
          "chat": "/chat"
        }
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
