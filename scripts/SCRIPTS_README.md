# Verification Scripts for Crypto Prognosticator

This suite provides tools for verifying deployment and system health after every Railway push.

## Scripts Overview

### 1. `verify-deployment.ts`
**Role:** Master post-deploy checklist.
**Purpose:** Verifies environment variables, Supabase schema (19 tables/critical columns), the atomic RPC function, Alpaca connectivity, Telegram bot status, and live cycle data.
**Usage:**
```bash
npx tsx scripts/verify-deployment.ts
```

### 2. `test-first-cycle.ts`
**Role:** Initial system verification.
**Purpose:** Performs a one-time test by fetching real BTC prices from CoinGecko, writing a complete mock cycle, and verifying database persistence.
**Usage:**
```bash
npx tsx scripts/test-first-cycle.ts
```

### 3. `crypto-postmortem.ts`
**Role:** Targeted postmortem trigger.
**Purpose:** Allows for manual processing of a specific prediction cycle using its UUID.
**Usage:**
```bash
npx tsx scripts/crypto-postmortem.ts --cycle-id=<uuid>
```

## Recommended Workflow

1. **Deploy:** Push changes to `main` (Railway auto-deploys).
2. **Verify Env & Schema:** Run `verify-deployment.ts`.
3. **Test One-Time Pipeline:** Run `test-first-cycle.ts` once to ensure the pipeline is safe.
4. **Enable Loops:** Confirm system is stable and allow 20-minute autonomous cycles to resume.
