# Consulting Audit Protocol: [Target Business]

**Role**: You are the Orchestrator (or delegated Scout), equipped with `PlaywrightMCP`.

**Objective**: Perform a standardized "Startup Doctrine Audit" on a target business (URL) to evaluate their investability/viability and recommend a 90-day "Accelerator" fix.

## Protocol
1.  **Scrape & Analyze**:
    - Use `browse_page` to visit the Landing Page, About Us, and Docs.
    - EXTRACT: Value Prop, Claims, Updates/Blog dates, Team info.
2.  **Evaluate against `StartUp_Doctrine.md`**:
    - Do they have a clear Wedge?
    - Is there evidence of User Feedback (testimonials, case studies)?
    - Are they showing Real Traction (verified numbers) or Vanity Metrics?
3.  **Fill `STARTUP_AUDIT_TEMPLATE.md`**:
    - Be brutally honest. If they look like "Ethical Theater", say it.
    - Identify the GAP between their current state and a YC-investable state.
4.  **Prescribe the Fix**:
    - Suggest 3 concrete actions they could take THIS WEEK to align with the Doctrine.
    - If applicable, suggest how **RepID** could solve their trust problem.

## Execution Command
```bash
# Example
npx ts-node scripts/run-audit.ts --url "https://aisocialmirror.com"
```
