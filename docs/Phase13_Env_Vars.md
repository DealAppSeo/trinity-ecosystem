# ENV VARS: Capability Expansion (Phase 13)

To fully enable the new capabilities implemented in Phase 13, the following environment variables need to be configured in your `.env` or Railway dashboard.

## 1. Multimodal & Specialized AI (Replicate)
- `REPLICATE_API_KEY`: Required for Video (Luma), Audio, and specialized LLM inference.
- `ELEVENLABS_API_KEY`: (Optional) If we implement the dedicated ElevenLabs MCP for voice synthesis.

## 2. Infrastructure & Compute (E2B)
- `E2B_API_KEY`: Required for the new stateful, cloud-isolated `ActionSandbox`.

## 3. Financial Research (AlphaVantage)
- `ALPHA_VANTAGE_API_KEY`: Existing, but ensure it's a "Premium" tier if heavy fundamental analysis is needed (Free tier is limited to 25 requests/day).

## 4. Documentation & Workspace (Google)
- `GOOGLE_APPLICATION_CREDENTIALS`: Ensure the service account has "Editor" permissions on the target Shared Drives/Folders for iterative spreadsheet updates.

---
*Config generated for the Trinity Swarm Founder*
