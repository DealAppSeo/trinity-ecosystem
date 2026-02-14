# Trinity Symphony Quick Reference

> Print this. Tape it to your monitor.

---

## 🚀 Session Start (Every Time)

```
"Read AI_CONTEXT.md and tell me: current status, my tasks, any blockers."
```

---

## 🏁 Session End (Every Time)

```
"Update AI_CONTEXT.md with: what we did, status changes, handoff notes."
```

Then: `git add AI_CONTEXT.md && git commit -m "Session update" && git push`

---

## 🔄 Agent Routing

| Need | Use | Why |
|------|-----|-----|
| Planning, Architecture, Review | **Claude** | Complex reasoning |
| Building, File Operations | **Gemini** | IDE access |
| Web3, Real-time, Verification | **Grok** | Current info |

---

## 🛡️ Heterogeneous Protocol

```
Author ≠ Verifier (ALWAYS)

Claude wrote it? → Gemini or Grok verifies
Gemini wrote it? → Claude or Grok verifies  
Grok wrote it? → Claude or Gemini verifies
```

---

## 🏷️ Required Labels

**For Handoffs:**
- `handoff`
- `author:[agent]`
- `verifier:[agent]` ← Must be different!

**For Verification:**
- `verification`
- `author:[agent]`
- `verifier:[agent]`

---

## ⚠️ The Five Rules

1. **Don't assume** → Query actual schema/files first
2. **Don't simplify** → Fix only the specific error
3. **Don't skip context** → Always read AI_CONTEXT.md
4. **Don't orphan handoffs** → Update context + create issue
5. **Don't same-agent verify** → Heterogeneous Protocol

---

## 📝 Handoff Template (Minimal)

```markdown
## Handoff: [From] → [To]
**Task:** [One line]
**Files:** [List key files]
**Accept when:** [How to verify done]
```

---

## 🚨 If Stuck

1. Update AI_CONTEXT.md with blocker
2. Create Issue with `blocked` label
3. Tag the agent who can help
4. Don't spin - escalate

---

## 📊 Sprint Status Icons

```
✅ DONE
🔄 IN PROGRESS  
⏳ NOT STARTED
❌ BLOCKED
⚠️ NEEDS REVIEW
```

---

*Keep it simple. Update context. Different agent verifies.*
