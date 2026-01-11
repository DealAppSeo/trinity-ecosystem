---
description: Semi-Autonomous Task Regeneration
---

# EVERGREEN PROTOCOL

**Trigger**: When a task is marked as `evergreen` (meaning it should never truly end).

## Core Logic
Instead of "Closing" the task, the agent must "Respawn" it.

## Process
1.  **Execute**: Perform the task logic (e.g. check system health, audit logs).
2.  **Evaluate**: Did anything change? (e.g. found errors, found no errors).
3.  **Respawn**:
    -   Create a NEW task with the same title but incremented Loop Count (e.g. `[LOOP 42] System Health`).
    -   Set `created_at` to `now()`.
    -   Status: `pending`.
4.  **Complete**: Mark the *current* task as completed.

## Recursive Innovation (The Upgrade)
If the task is a `[GENERATOR]` or `[ITERATE]` type:
-   **Do NOT just respawn same task.**
-   **Analyze Output**: Based on what you found (e.g. "Grant X found"), spawn a *child* task (`[APPLY] Grant X`).
-   **Then Respawn Self**: To keep looking for more.
