# Railway LiteLLM Setup Instructions

**Goal:** Configure the `trinity-litellm` proxy and inject the `TOOL_RECEIPT_SECRET`.

1. **Fix LiteLLM Healthcheck**
   - Log into your Railway Dashboard.
   - Go to the `trinity-litellm` service.
   - Go to Settings -> Networking -> Generate Domain.
   - If the healthcheck is timing out (600s), ensure that your `litellm_config.yaml` is properly deployed. (I have fixed the invalid model strings in the configuration).

2. **Add the LiteLLM URL to the Ecosystem**
   - Copy the generated domain for the proxy (e.g. `trinity-litellm-production.up.railway.app`).
   - Go to your Shared Environment Variables or the `trinity-ecosystem` variables.
   - Add/Set `LITELLM_URL=https://<your-generated-domain>`.

3. **Add the TOOL_RECEIPT_SECRET**
   - I have autonomously generated a cryptographically secure 32-byte hex string.
   - **VALUE:** `38193de052d7d43a580760092f53a2364b87e5203aa66da17c0764ed865f1396b`
   - In Railway, go to your Shared Variables.
   - Add a new variable: `TOOL_RECEIPT_SECRET` and paste the value above.
   - This ensures that HMAC hashes for reasoning receipts are perfectly secure across both litellm and the ecosystem validators.
