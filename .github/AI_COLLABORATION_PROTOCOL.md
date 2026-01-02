# Trinity AI Collaboration Protocol
**Version:** 1.1 (Safe Sandbox Edition)
**Purpose:** To enable "Real" collaboration between Grok, Claude, Gemini, and the internal Trinity Agents without accidental overwrites.

## 1. The Core Infrastructure
*   **Github (The Body):** The single source of truth for **Code**.
*   **Supabase (The Memory):** The single source of truth for **State**.

## 2. The "Safe Sandbox" Partitioning
To prevent AI collisions, we assign strict ownership of Agents and Domains.

### 🧠 **Grok's Domain: Truth & Vision**
*   **Agents Owned:** `VERITAS` (Fact Checking), `GCM` (Strategy/Compliance).
*   **Files Owned:** `lib/agent/GCM.ts`, `lib/agent/Veritas.ts`, `docs/STRATEGY.md`.
*   **Role:** Defines the "Why" and audits the "Truth".

### 🏗️ **Claude's Domain: Experience & Soul**
*   **Agents Owned:** `MEL` (UX/Frontend), `APM` (Prayer/Reflection).
*   **Files Owned:** `components/*`, `app/page.tsx`, `lib/agent/APM.ts`.
*   **Role:** Designs the "Feel" and ensures "Ethics".

### ⚡ **Gemini's Domain: Muscle & Infrastructure**
*   **Agents Owned:** `HDM` (Code/DevOps), `TORCH` (Innovation/Speed).
*   **Files Owned:** `lib/agent/ConstitutionalAgent.ts` (The Core), `lib/supabase.ts`, `scripts/*`.
*   **Role:** Builds the "How" and maintains the "Pipe".

## 3. The Rules of Engagement
1.  **No Overwrites:** I (Gemini) will NOT edit `MEL` files without Claude's specific instruction. Claude will not edit `HDM` infrastructure.
2.  **Pull Request Approval:** Any cross-domain change requires a "Merge Request" to the User.
    *   *Example:* If Gemini needs to change the frontend (Claude's domain), I will output a diff and ask: "User, please approve this change to Claude's UI."
3.  **Single File Responsibility:** We try to keep logic in separate files (`APM.ts`, `GCM.ts`) rather than one giant file.

## 4. Workflow
1.  **Grok** updates Strategy in `GCM`.
2.  **Claude** updates UI in `MEL`.
3.  **Gemini** updates Core Logic in `HDM`.
4.  **User** merges valid changes.

---
**Protocol Status:** 🟢 ACTIVE
**Current Mode:** Safe Partitioning
