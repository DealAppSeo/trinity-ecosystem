# 🛡️ AGENT SAFETY RULES: Preventing Loops & Failures

> **Add these rules to every agent directive to prevent runaway processes.**

---

## 🚫 Anti-Loop Rules (CRITICAL)

### Rule 1: Retry Limits
```
RETRY POLICY:
- Maximum 3 retries for any single operation
- After 3 failures: STOP, log error, create blocked issue, move on
- NEVER retry infinitely
- NEVER use "while true" or unbounded loops for external operations
```

### Rule 2: Timeout Boundaries
```
TIMEOUT POLICY:
- External API calls: 30 second timeout
- File operations: 60 second timeout
- Package installations: 5 minute timeout
- If timeout exceeded: STOP, don't retry automatically
```

### Rule 3: Tool Availability Check
```
BEFORE USING ANY TOOL:
1. Check if tool exists: `which <tool>` or `command -v <tool>`
2. If tool doesn't exist: STOP, report missing dependency
3. NEVER use npx for non-npm tools (gh, docker, etc.)
4. NEVER assume a tool is available - verify first
```

### Rule 4: Exit on Unknown State
```
IF CONFUSED OR UNCERTAIN:
1. STOP current operation
2. Log current state to issue
3. Create blocked issue with clear question
4. Move to next task
5. NEVER spin trying to figure it out
```

---

## 🔧 Safe Command Patterns

### ❌ DANGEROUS (Don't Do)
```bash
# Infinite retry loop
while ! gh label create...; do
  sleep 1
done

# npx for non-npm tools
npx gh label create...

# Unbounded operations
for label in $(cat labels.txt); do
  gh label create $label  # Could loop forever on failure
done
```

### ✅ SAFE (Do This)
```bash
# Check tool first
if ! command -v gh &> /dev/null; then
  echo "ERROR: gh CLI not installed"
  exit 1
fi

# Bounded retry
MAX_RETRIES=3
retry_count=0
while [ $retry_count -lt $MAX_RETRIES ]; do
  if gh label create...; then
    break
  fi
  retry_count=$((retry_count + 1))
  sleep 2
done

if [ $retry_count -eq $MAX_RETRIES ]; then
  echo "FAILED after $MAX_RETRIES attempts"
  # Create GitHub issue for human
  exit 1
fi
```

---

## 📋 Pre-Flight Checklist

**Before any multi-step operation:**
```
1. [ ] All required tools verified available?
2. [ ] Retry limits defined?
3. [ ] Timeout configured?
4. [ ] Failure path documented?
5. [ ] Way to stop if things go wrong?
```

---

## 🚨 Emergency Stop Patterns

### If Agent Seems Stuck

**For Gemini/Antigravity:**
```
STOP.

Current operation appears stuck. Please:
1. Terminate any running processes
2. Report what you were trying to do
3. Report what error or state you're in
4. Do NOT retry the same operation
5. Wait for my instructions
```

### If You Suspect Loop

**For any agent:**
```
HALT ALL OPERATIONS.

I suspect you may be in a retry loop. Please:
1. Count how many times you've attempted the current operation
2. If > 3 attempts: STOP immediately
3. Report the operation and failure mode
4. Create a blocked issue
5. Move to a different task
```

---

## 🔄 Recovery Procedures

### After a Loop is Detected

1. **Identify the cause:**
   - Missing tool?
   - Network issue?
   - Permission problem?
   - Wrong command syntax?

2. **Fix root cause first:**
   - Install missing tool
   - Fix permissions
   - Update command syntax

3. **Resume with safeguards:**
   - Add explicit retry limits
   - Add timeout
   - Add success verification

---

## 📊 Operations That Often Loop

| Operation | Risk | Safeguard |
|-----------|------|-----------|
| `npm install` | Medium | Timeout, retry limit |
| `gh` commands | High | Check tool exists first |
| API calls | Medium | Timeout, retry with backoff |
| File watchers | High | Always have exit condition |
| Build processes | Medium | Timeout |
| Package downloads | High | Verify URL first, timeout |

---

## 🎯 Golden Rule

> **If something fails 3 times, it won't succeed on the 4th. Stop, report, move on.**

---

*Add these rules to your agent briefings to prevent runaway processes.*
