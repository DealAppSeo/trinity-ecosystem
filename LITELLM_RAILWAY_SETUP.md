# LiteLLM Railway Service Setup (Manual)

To deploy the unified LiteLLM router proxy alongside the main Trinity agents, you must instantiate a new Docker-based sidecar service on Railway.

### 1. Create the Service
- Go to your Railway Project (`trinity-ecosystem`)
- Click **+ New** -> **Empty Service**
- Rename the service to `trinity-litellm`

### 2. Configure the Deployment
- In the `trinity-litellm` Settings -> Deploy tab:
  - Scroll down to **Docker Image** (under Source)
  - Set the image to: `ghcr.io/berriai/litellm:main-latest`
  - Set the **Start Command** to: `litellm --config config.yaml --port 4000 --num_workers 4`

### 3. Add the Configuration (litellm_config.yaml)
Because we are using an empty service pulling directly from the public GHCR image rather than building our repo, we must pass our configuration file and API keys via Environment Variables.

In the `trinity-litellm` **Variables** tab, add the following RAW TEXT variable exactly as shown. 
Set the Variable Name to `LITELLM_CONFIG_YAML` and paste the contents of our `litellm_config.yaml` file into the value, or use Railway's config file feature:
*(Alternatively, you can link the github repo to this service and set the root directory to / and the Dockerfile to a custom Dockerfile that copies the yaml locally, but injecting as env is faster for sidecars)*

If using purely env vars, add:
- `LITELLM_MASTER_KEY`: Your secure master key used by the Trinity Router
- All upstream provider API keys (Groq, Anthropic, DeepSeek, OpenRouter, Mistral, Together, OpenAI)

### 4. Networking
- Generate a Public Domain for `trinity-litellm`
- **Crucial**: Copy that domain and add it to the main `trinity-ecosystem` environment as `LITELLM_URL` (e.g., `https://trinity-litellm.up.railway.app`)

Once the service is active, notify the AI node so it can proceed with `/health` validation and completion testing.
