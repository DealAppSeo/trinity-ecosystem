# 🌙 EVENING HANDOFF PROMPT (v2 - With Safety Rules)

> **Copy this entire prompt and send to Gemini before going offline.**
> **Update the [BRACKETED] sections with tonight's specific tasks.**

---

## START COPYING HERE ⬇️

---

EVENING HANDOFF - AUTONOMOUS OVERNIGHT OPERATION

I'm going offline until tomorrow morning (~8 hours from now).

---

## 📋 STEP 1: PRE-FLIGHT CHECKS

Before starting ANY work, complete these checks:

1. **Pull latest:**
   ```bash
   git pull origin main
   ```

2. **Verify context health:**
   ```bash
   node scripts/verify-context.mjs
   ```
   - If CRITICAL errors: STOP and create blocked issue
   - If warnings: Note them but proceed

3. **Check for blocked issues:**
   - Review any issues with `blocked` label
   - If you can resolve them: do so first
   - If you cannot: leave them for morning

4. **Confirm clean state:**
   ```bash
   git status
   ```
   - Should show "nothing to commit, working tree clean"
   - If dirty: commit or stash before proceeding

---

## 🎯 STEP 2: TONIGHT'S PRIORITY TASKS

Execute in this exact order. Complete each fully before starting next.

### Task 1: [TASK NAME]
- **Issue:** #[NUMBER] or [DESCRIPTION]
- **Files:** [LIST KEY FILES]
- **Acceptance Criteria:**
  - [ ] [SPECIFIC TESTABLE CRITERION 1]
  - [ ] [SPECIFIC TESTABLE CRITERION 2]
  - [ ] [SPECIFIC TESTABLE CRITERION 3]
- **Estimated time:** [X hours]

### Task 2: [TASK NAME]
- **Issue:** #[NUMBER] or [DESCRIPTION]
- **Files:** [LIST KEY FILES]
- **Acceptance Criteria:**
  - [ ] [CRITERION 1]
  - [ ] [CRITERION 2]
- **Estimated time:** [X hours]

### Task 3: [TASK NAME]
- **Issue:** #[NUMBER] or [DESCRIPTION]
- **Files:** [LIST KEY FILES]
- **Acceptance Criteria:**
  - [ ] [CRITERION 1]
  - [ ] [CRITERION 2]
- **Estimated time:** [X hours]

---

## 🛡️ STEP 3: SAFETY RULES (CRITICAL - FOLLOW EXACTLY)

### Anti-Loop Rules
```
⚠️ MAXIMUM 3 RETRIES FOR ANY OPERATION

After 3 failures:
1. STOP immediately
2. Log the error
3. Create GitHub issue with `blocked` label
4. Move to next task
5. DO NOT retry again

NEVER use unbounded loops for external operations.
NEVER use `while true` or infinite retry patterns.
```

### Tool Verification
```
BEFORE USING ANY COMMAND-LINE TOOL:

1. Verify it exists:
   command -v <tool> || echo "TOOL NOT FOUND"

2. If tool not found:
   - DO NOT try npx (gh, docker, etc. are not npm packages)
   - Create blocked issue
   - Move to next task

3. Known tools that are NOT npm packages:
   - gh (GitHub CLI)
   - docker
   - kubectl
   - terraform
   - aws/gcloud/az CLIs
```

### Timeout Rules
```
TIMEOUTS:
- API calls: 30 seconds max
- npm install: 5 minutes max
- Build processes: 10 minutes max
- Any single operation: 15 minutes max

If timeout exceeded:
1. Kill the process
2. Log what happened
3. Create blocked issue
4. Move to next task
```

### Uncertainty Rule
```
IF YOU ARE UNCERTAIN ABOUT ANYTHING:

1. STOP - do not guess
2. Create GitHub issue with:
   - What you're trying to do
   - What you're uncertain about
   - Specific question for morning
3. Add `blocked` label
4. Move to next task

DO NOT spin trying to figure things out.
15 minutes max on any decision, then escalate.
```

---

## 🚫 STEP 4: BOUNDARIES (DO NOT CROSS)

You have permission to:
- ✅ Write new code in existing patterns
- ✅ Create new files following established conventions
- ✅ Fix bugs with targeted changes
- ✅ Add tests
- ✅ Update documentation
- ✅ Commit and push to feature branches
- ✅ Create issues and PRs

You do NOT have permission to:
- ❌ Make architectural decisions
- ❌ Delete or significantly refactor existing code
- ❌ Change database schemas without migration
- ❌ Add new dependencies without flagging
- ❌ Merge PRs to main
- ❌ Modify environment variables or secrets
- ❌ Change CI/CD configurations
- ❌ Assume database column names (query schema first)
- ❌ Simplify code "for clarity" (often breaks things)

If you need to do something on the ❌ list:
1. Create issue explaining why
2. Add `blocked` label
3. Wait for morning approval

---

## 📝 STEP 5: COMMIT PROTOCOL

### After Each Completed Task:
```bash
# Stage changes
git add .

# Commit with descriptive message
git commit -m "[TASK] Brief description of what was done

- Detail 1
- Detail 2

Closes #ISSUE_NUMBER (if applicable)"

# Push to branch
git push origin [BRANCH]
```

### Create Verification Request:
After completing each task, create a GitHub issue:
- Title: `[VERIFY] [Task Name]`
- Labels: `verification`, `author:gemini`, `verifier:claude` (or `verifier:grok`)
- Body: What was built, files changed, how to verify

---

## 🔄 STEP 6: SYNC PROTOCOL

### Every 2 Hours (or after each task):
```bash
# Sync context
node scripts/trinity-sync.mjs [OWNER/REPO]

# Commit context update
git add AI_CONTEXT.md
git commit -m "Sync: [timestamp] - [brief status]"
git push
```

### If You Encounter Conflicts:
1. Do NOT auto-resolve
2. Create issue with `blocked` label
3. Include conflict details
4. Move to next task

---

## 🏁 STEP 7: BEFORE YOU STOP

When you've completed all tasks OR hit too many blockers:

### 1. Final Context Update
Update AI_CONTEXT.md Session Log:
```markdown
### [DATE] Overnight Session (Gemini)

**Completed:**
- [x] Task 1: [description] - commit [hash]
- [x] Task 2: [description] - commit [hash]

**In Progress:**
- [ ] Task 3: [status, what's left]

**Blocked:**
- Task 4: [reason] - see issue #XX

**Decisions Needed:**
- [Question 1]
- [Question 2]

**Notes for Morning:**
- [Anything important to know]
```

### 2. Commit Final State
```bash
git add AI_CONTEXT.md
git commit -m "Overnight session complete - [summary]"
git push
```

### 3. Create Overnight Report Issue
Create a GitHub issue:
- Title: `📋 Overnight Report [DATE]`
- Labels: `documentation`
- Body: Summary of what was done, what's blocked, what's next

---

## ⏰ TIME MANAGEMENT

```
Total overnight window: ~8 hours

Suggested allocation:
- Task 1: [X hours]
- Task 2: [X hours]  
- Task 3: [X hours]
- Buffer for issues: 1 hour
- Final sync & report: 30 min
```

If you finish early:
- Check for other open issues you can address
- Improve test coverage
- Update documentation
- DO NOT start architectural work

If you're running behind:
- Focus on completing current task fully
- Don't start new tasks you can't finish
- Document status clearly for morning

---

## 🚨 EMERGENCY CONTACTS

If something goes critically wrong:
1. STOP all operations
2. Create issue with `critical` and `blocked` labels
3. Title: `🚨 CRITICAL: [brief description]`
4. Document exactly what happened
5. Do NOT attempt to fix critical issues overnight

---

## ✅ CONFIRMATION

Before starting, please confirm:
1. "I have pulled latest and verified context health"
2. "I understand the 3-retry maximum rule"
3. "I will not use npx for non-npm tools"
4. "I will create blocked issues rather than spin"
5. "I will update AI_CONTEXT.md before stopping"

Then respond: "Confirmed. Beginning overnight autonomous operation."

---

## 🚀 BEGIN AUTONOMOUS OPERATION

Execute tasks in priority order.
Follow all safety rules.
I'll review your progress in the morning.

Good luck! 🌙

---

## STOP COPYING HERE ⬆️

---

# 📝 QUICK CUSTOMIZATION CHECKLIST

Before sending, update these sections:
- [ ] Task 1, 2, 3 details (name, files, acceptance criteria)
- [ ] Time estimates
- [ ] Branch name if not main
- [ ] OWNER/REPO in sync commands
- [ ] Any task-specific boundaries or permissions
