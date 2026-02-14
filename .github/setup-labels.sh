#!/bin/bash
# Trinity Symphony GitHub Labels Setup Script
# 
# Usage: ./setup-labels.sh [OWNER/REPO]
# Example: ./setup-labels.sh hyperdag/trinity-ecosystem
#
# Requires: GitHub CLI (gh) authenticated

set -e

REPO=${1:-""}

if [ -z "$REPO" ]; then
    echo "Usage: ./setup-labels.sh OWNER/REPO"
    echo "Example: ./setup-labels.sh hyperdag/trinity-ecosystem"
    exit 1
fi

echo "🏷️  Setting up Trinity Symphony labels for $REPO..."
echo ""

# Agent Assignment Labels
echo "Creating agent labels..."
gh label create "author:claude" --repo "$REPO" --description "Work authored by Claude" --color "D4A574" --force 2>/dev/null || true
gh label create "author:gemini" --repo "$REPO" --description "Work authored by Gemini/Antigravity" --color "4285F4" --force 2>/dev/null || true
gh label create "author:grok" --repo "$REPO" --description "Work authored by Grok" --color "1DA1F2" --force 2>/dev/null || true
gh label create "verifier:claude" --repo "$REPO" --description "Claude assigned as verifier" --color "D4A574" --force 2>/dev/null || true
gh label create "verifier:gemini" --repo "$REPO" --description "Gemini assigned as verifier" --color "4285F4" --force 2>/dev/null || true
gh label create "verifier:grok" --repo "$REPO" --description "Grok assigned as verifier" --color "1DA1F2" --force 2>/dev/null || true

# Workflow Labels
echo "Creating workflow labels..."
gh label create "handoff" --repo "$REPO" --description "Cross-agent task transfer" --color "7057FF" --force 2>/dev/null || true
gh label create "verification" --repo "$REPO" --description "Requires cross-agent verification" --color "0E8A16" --force 2>/dev/null || true
gh label create "heterogeneous-protocol" --repo "$REPO" --description "Multi-LLM coordination required" --color "FBCA04" --force 2>/dev/null || true
gh label create "protocol-violation" --repo "$REPO" --description "Heterogeneous Protocol violated - must fix" --color "B60205" --force 2>/dev/null || true

# Status Labels
echo "Creating status labels..."
gh label create "blocked" --repo "$REPO" --description "Cannot proceed - needs intervention" --color "D93F0B" --force 2>/dev/null || true
gh label create "in-progress" --repo "$REPO" --description "Currently being worked on" --color "0052CC" --force 2>/dev/null || true
gh label create "needs-review" --repo "$REPO" --description "Ready for verification" --color "FBCA04" --force 2>/dev/null || true
gh label create "approved" --repo "$REPO" --description "Verified and approved" --color "0E8A16" --force 2>/dev/null || true

# Priority Labels
echo "Creating priority labels..."
gh label create "critical" --repo "$REPO" --description "Production incident or blocker" --color "B60205" --force 2>/dev/null || true
gh label create "high-priority" --repo "$REPO" --description "Important - address soon" --color "D93F0B" --force 2>/dev/null || true
gh label create "low-priority" --repo "$REPO" --description "Nice to have" --color "C2E0C6" --force 2>/dev/null || true

# Type Labels
echo "Creating type labels..."
gh label create "bug" --repo "$REPO" --description "Something isn't working" --color "D73A4A" --force 2>/dev/null || true
gh label create "enhancement" --repo "$REPO" --description "New feature or improvement" --color "A2EEEF" --force 2>/dev/null || true
gh label create "documentation" --repo "$REPO" --description "Documentation changes" --color "0075CA" --force 2>/dev/null || true
gh label create "sprint-task" --repo "$REPO" --description "Current sprint work item" --color "7057FF" --force 2>/dev/null || true
gh label create "decision" --repo "$REPO" --description "Architectural decision record" --color "D4C5F9" --force 2>/dev/null || true
gh label create "triage" --repo "$REPO" --description "Needs initial assessment" --color "D876E3" --force 2>/dev/null || true

# Squad Labels
echo "Creating squad labels..."
gh label create "squad:orchestration" --repo "$REPO" --description "ORCH, W3C, SHOFET" --color "5319E7" --force 2>/dev/null || true
gh label create "squad:alpha" --repo "$REPO" --description "TORCH, VERITAS, GCM (Truth)" --color "1D76DB" --force 2>/dev/null || true
gh label create "squad:beta" --repo "$REPO" --description "CHESED, MEL, APM (Care)" --color "0E8A16" --force 2>/dev/null || true
gh label create "squad:gamma" --repo "$REPO" --description "SOPHIA, NEXUS, HDM (Build)" --color "D93F0B" --force 2>/dev/null || true

# Phase Labels
echo "Creating phase labels..."
gh label create "phase:0" --repo "$REPO" --description "Foundation phase" --color "BFD4F2" --force 2>/dev/null || true
gh label create "phase:1" --repo "$REPO" --description "Core development" --color "C5DEF5" --force 2>/dev/null || true
gh label create "phase:2" --repo "$REPO" --description "Integration phase" --color "D4E1F5" --force 2>/dev/null || true

echo ""
echo "✅ All labels created successfully!"
echo ""
echo "Next steps:"
echo "1. Copy issue templates to .github/ISSUE_TEMPLATE/"
echo "2. Copy AI_CONTEXT.md to repository root"
echo "3. Copy workflows to .github/workflows/"
echo "4. Commit and push"
