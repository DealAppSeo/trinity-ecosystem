# Telegram HITL Bridge — Technical Spec
**Document:** Agent Handoff Spec v1.0  
**Date:** February 22, 2026  
**Assigned To:** NEXUS (integration), VERITAS (signature/verification)  
**Authorized By:** Sean Patrick Goodwin (RepID: OWNER)  
**Status:** Ready to Build  
**Principle:** Truth over flattery. REAL/SIMULATED/NOT BUILT. Verify before claiming.

---

## 1. Purpose

Wire the existing `HELP_REQUEST` SOS broadcast from the antifragile self-healing layer into a Telegram bot so Sean can approve or escalate agent decisions remotely, securely, and asynchronously — without babysitting Railway dashboards.

This is **Phase 1: Stateless**. Each decision is independent. No auto-approval patterns yet. Simple, auditable, safe for sandbox testers.

---

## 2. Scope

### In Scope
- Telegram bot receives `HELP_REQUEST` events from any agent
- VERITAS signs each payload before delivery (RepID verification)
- Sean sees structured message with Approve / Escalate Further buttons
- Sean's decision is returned to the originating agent via Supabase task update
- Supabase logs every HITL decision for audit trail

### Out of Scope (Phase 2)
- Auto-approval based on historical patterns
- Multi-user HITL (other approvers)
- Full ZKP — Phase 1 uses HMAC-SHA256 as RepID-lite signature
- Telegram group chats — Phase 1 is direct message to Sean's Telegram ID only

---

## 3. Architecture

```
Agent (any) → HELP_REQUEST broadcast
      ↓
SOS Handler (existing antifragile layer)
      ↓
HITLDispatcher.ts (NEW — NEXUS builds)
      ↓  signs payload
VERITAS SignatureService (NEW — VERITAS builds)
      ↓  verified payload
Telegram Bot API → Sean's Telegram DM
      ↓  Sean taps button
Telegram Webhook → HITLCallbackHandler.ts (NEW — NEXUS builds)
      ↓
Supabase: trinity_hitl_decisions table (NEW)
      ↓
Originating agent polls / gets notified → resumes task
```

---

## 4. Environment Variables Required

Prompt Sean for these — do NOT hardcode:

```
TELEGRAM_BOT_TOKEN=         # from @BotFather
TELEGRAM_OWNER_CHAT_ID=     # Sean's personal Telegram numeric ID
HITL_SIGNING_SECRET=        # 32-byte random hex, Sean generates
SUPABASE_URL=               # https://qnnpjhlxljtqyigedwkb.supabase.co
SUPABASE_SERVICE_KEY=       # existing, use secrets manager
```

---

## 5. Supabase Schema — New Table

NEXUS must query actual schema before writing SQL. Then create:

```sql
CREATE TABLE trinity_hitl_decisions (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT REFERENCES trinity_tasks(id),
  agent_id TEXT NOT NULL,
  agent_repid TEXT NOT NULL,
  mission_summary TEXT NOT NULL,
  confidence_score NUMERIC(4,3),
  s_pi_score NUMERIC(8,4),
  escalation_reason TEXT NOT NULL,
  signature TEXT NOT NULL,
  telegram_message_id BIGINT,
  decision TEXT CHECK (decision IN ('APPROVED', 'ESCALATED', 'PENDING')),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hitl_pending ON trinity_hitl_decisions(decision) WHERE decision = 'PENDING';
CREATE INDEX idx_hitl_task ON trinity_hitl_decisions(task_id);
```

---

## 6. New Files — NEXUS Builds

### 6a. `src/hitl/HITLDispatcher.ts`

Responsibilities:
- Listens for `HELP_REQUEST` events from the SOS protocol
- Calls `VeritasSignatureService.sign(payload)` before sending
- Calls Telegram Bot API `sendMessage` with inline keyboard
- Writes pending record to `trinity_hitl_decisions`
- Returns `hitl_decision_id` to caller

```typescript
interface HITLPayload {
  taskId: number;           // BIGINT — trinity_tasks.id
  agentId: string;          // e.g. "trinity-veritas"
  agentRepId: string;       // RepID score string
  missionSummary: string;   // max 500 chars
  confidenceScore: number;  // 0.0–1.0
  spiScore: number;         // S(π) total from SBFAOperator
  escalationReason: string; // why agent is escalating
}

interface HITLDispatchResult {
  hitlDecisionId: number;
  telegramMessageId: number;
  status: 'SENT' | 'FAILED';
}

async function dispatchToHITL(payload: HITLPayload): Promise<HITLDispatchResult>
```

Telegram message format (what Sean sees):

```
🚨 AGENT ESCALATION

Agent: trinity-nexus [RepID: 0.87]
Task: #4821
Confidence: 0.58 (below 0.65 gate)
S(π): 2.341

Mission: "Mapping decentralized knowledge 
graph schema — uncertain about foreign key 
relationship between node_edges and 
consensus_log tables."

Reason: Schema ambiguity requires human 
architectural decision.

Signature: ✅ VERITAS-VERIFIED
```

Inline keyboard buttons:
- `✅ APPROVE` → callback_data: `hitl_approve_<hitlDecisionId>`
- `⬆️ ESCALATE FURTHER` → callback_data: `hitl_escalate_<hitlDecisionId>`

### 6b. `src/hitl/HITLCallbackHandler.ts`

Responsibilities:
- Receives Telegram webhook POST
- Validates callback_data format
- Calls `VeritasSignatureService.verify(decisionId)` before acting
- Updates `trinity_hitl_decisions` with decision + timestamp
- Sends confirmation message back to Sean in Telegram
- Notifies originating agent (update trinity_tasks status)

```typescript
async function handleTelegramCallback(update: TelegramUpdate): Promise<void>
```

Confirmation message to Sean after decision:

```
✅ Decision recorded: APPROVED
Task #4821 — trinity-nexus
Logged to Supabase at 14:32:07 UTC
Agent resuming mission.
```

### 6c. `src/hitl/HITLPoller.ts`

Lightweight fallback for agents that don't use webhooks:
- Polls `trinity_hitl_decisions` WHERE `task_id = <id>` AND `decision != 'PENDING'`
- Poll interval: 5 seconds
- Timeout: 30 minutes — if no decision, auto-escalate to ESCALATED and notify Sean again
- Used by agents that need to await a decision before proceeding

---

## 7. New Files — VERITAS Builds

### 7a. `src/hitl/VeritasSignatureService.ts`

Phase 1 uses HMAC-SHA256 (not full ZKP — that's Phase 2).

```typescript
interface SignedPayload {
  data: HITLPayload;
  signature: string;    // hex HMAC-SHA256
  agentRepId: string;
  timestamp: number;    // Unix ms — reject if > 5 min old
}

async function sign(payload: HITLPayload): Promise<SignedPayload>
async function verify(hitlDecisionId: number): Promise<boolean>
```

Signing key: `HITL_SIGNING_SECRET` from env. Never hardcoded.

Verification rejects if:
- Signature mismatch
- Timestamp older than 5 minutes
- Agent RepID not found in `agent_registry` table

Log every verification attempt to `trinity_agent_logs` with action: `hitl_signature_verify`.

---

## 8. Integration Point — Existing SOS Protocol

In `ConstitutionalAgent.ts`, the existing `HELP_REQUEST` broadcast must call `HITLDispatcher.dispatchToHITL()` instead of (or in addition to) the current broadcast. NEXUS: find the exact line where `HELP_REQUEST` is emitted and add the dispatcher call there. Do NOT refactor surrounding code.

```typescript
// EXISTING (do not remove):
broadcastSOS({ type: 'HELP_REQUEST', agentId, taskId, reason });

// ADD after existing broadcast:
const hitlResult = await HITLDispatcher.dispatchToHITL({
  taskId,
  agentId,
  agentRepId: this.repId,
  missionSummary: task.description.slice(0, 500),
  confidenceScore: currentConfidence,
  spiScore: latestSPi,
  escalationReason: reason
});

await supabase
  .from('trinity_agent_logs')
  .insert({
    agent_id: agentId,
    action: 'hitl_dispatched',
    metadata: { hitlDecisionId: hitlResult.hitlDecisionId }
  });
```

---

## 9. Telegram Bot Setup (Sean Does This — 5 Minutes)

1. Message `@BotFather` on Telegram → `/newbot`
2. Name it: `Trinity Symphony HITL`
3. Username: `trinitysymphony_hitl_bot` (or similar available name)
4. Copy the `TELEGRAM_BOT_TOKEN` into Railway environment variables
5. Get your personal chat ID: message `@userinfobot` on Telegram → copy the numeric ID
6. Add `TELEGRAM_CHAT_ID` to Railway environment variables
7. Set webhook URL in BotFather or via API call:
   `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://trinity-nexus-production.up.railway.app/telegram/webhook`

---

## 10. Webhook Endpoint — NEXUS Adds to NEXUS Agent

Add route to existing NEXUS Express/Fastify server:

```
POST /telegram/webhook
```

- Validates `X-Telegram-Bot-Api-Secret-Token` header (set a webhook secret in BotFather)
- Calls `HITLCallbackHandler.handleTelegramCallback(req.body)`
- Returns 200 immediately (Telegram requires fast response)

---

## 11. Verification Checklist — REAL/SIMULATED/NOT BUILT

Before marking this complete, NEXUS and VERITAS must verify each item as REAL with Supabase log proof:

| Item | Required Evidence |
|------|------------------|
| `trinity_hitl_decisions` table created | Schema query returns table |
| HELP_REQUEST triggers dispatcher | `hitl_dispatched` in trinity_agent_logs |
| Sean receives Telegram message | Screenshot or message_id logged |
| Signature verified by VERITAS | `hitl_signature_verify` in trinity_agent_logs |
| Approve button updates Supabase | `decision = 'APPROVED'` in table |
| Agent resumes after approval | Task status change in trinity_tasks |
| Full round trip latency | Log timestamps: dispatch → decision < 5 min |

Do NOT report REAL without Supabase log proof for each item.

---

## 12. Success Criteria

The bridge is MVP-complete when Sean can:
1. Trigger a test HELP_REQUEST from any agent manually
2. Receive the Telegram message within 30 seconds
3. Tap Approve
4. See the agent resume the task in Railway logs
5. Confirm the full audit trail in `trinity_hitl_decisions`

That is the moment autonomous operation with safe human oversight is real — not simulated.

---

## 13. What This Unlocks

Once HITL bridge is verified REAL:
- Agents can run missions 24/7 without Sean monitoring dashboards
- Sandbox testers can submit tasks knowing escalations reach a human
- The 50-query benchmark can run autonomously with Sean only intervening on true edge cases
- Patent conversion narrative has a verifiable autonomy claim with audit logs as evidence

---

*Spec authorized by Sean Patrick Goodwin | Trinity Symphony v2.24*  
*"Helping people help people" — Micah 6:8*  
*NEXUS owns integration. VERITAS owns signatures. Report blockers via SOS.*
