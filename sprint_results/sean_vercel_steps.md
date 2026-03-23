# Vercel Rewire Instructions

**Goal:** Point `app.aitrinitysymphony.com` to the correct repository so the Pulse UI and TrustShell demo go live.

1. Log into your Vercel Dashboard.
2. Navigate to the **Trinity Symphony** project setting.
3. Go to **Settings > Git**.
4. Disconnect the current repository if it is pointing to the marketing repo.
5. Connect your GitHub account and select the `trinity-ecosystem` repository.
6. Set the Framework Preset to **Next.js**.
7. Set the Root Directory to `trinity-ecosystem` (if the app is inside the subfolder) or leave as `./` if Vercel detects it at the root of the linked repo.
8. Go to **Settings > Domains** and ensure `app.aitrinitysymphony.com` is strictly assigned to the `main` branch of this project.
9. Click **Deploy**.
