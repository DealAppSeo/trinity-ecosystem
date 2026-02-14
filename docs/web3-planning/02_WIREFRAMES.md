# Trinity Symphony v2.0: Mobile App Wireframes

## Overview
This document describes all screens, user flows, and UI components for the Trinity Symphony Flutter mobile application.

**Design System:** Material Design 3
**Color Scheme:** Dark mode primary (blue-purple gradient), Light mode optional
**Typography:** Roboto (body), Montserrat (headings)

---

## Screen Hierarchy

```
App Launch
├─ Splash Screen
├─ Onboarding Flow (first-time users)
│  ├─ Welcome Screen
│  ├─ Features Overview (3 slides)
│  ├─ Permission Requests
│  └─ Account Setup
├─ Authentication
│  ├─ Login Screen
│  └─ Register Screen
└─ Main App (Authenticated)
   ├─ Dashboard (Tab 1) ← Default
   ├─ Inbox (Tab 2)
   ├─ Canvas (Tab 3)
   ├─ Agents (Tab 4)
   ├─ Settings
   ├─ Agent Detail
   ├─ Task History
   └─ Voice Control (Modal)
```

---

## Screen Specifications

### 1. Dashboard Screen

**Purpose:** Overview of agent swarm status, recent activity, reputation summary

**Layout:**
```
┌─────────────────────────────────────┐
│ Trinity Symphony     [Settings Icon]│
│ Connected                            │
├─────────────────────────────────────┤
│                                      │
│  ┌─────────────────────────────────┐│
│  │   Agent Swarm Visualization     ││
│  │   (Animated circular layout)    ││
│  │                                  ││
│  │   ●──●──●──●  (8 agents)        ││
│  │   │  │  │  │                    ││
│  │   ●──●──●──●                    ││
│  │                                  ││
│  │   Center: Swarm Health 87%      ││
│  └─────────────────────────────────┘│
│                                      │
│  Swarm Reputation                   │
│  ┌─────────────────────────────────┐│
│  │ [Bar Chart showing agent RepIDs]││
│  │ NEXUS    ████████░░  595        ││
│  │ VERITAS  █████████░  619        ││
│  │ APM      ██████████  631        ││
│  │ ...                              ││
│  └─────────────────────────────────┘│
│                                      │
│  Recent Activity                    │
│  ┌─────────────────────────────────┐│
│  │ ⚡ NEXUS completed task         ││
│  │    "Find Web3 news" - 2m ago    ││
│  ├─────────────────────────────────┤│
│  │ ⬆ GCM reputation +5             ││
│  │    Quality score: 92 - 15m ago  ││
│  ├─────────────────────────────────┤│
│  │ 🔄 Bridge sync to Arbitrum       ││
│  │    3 agents synced - 1h ago     ││
│  └─────────────────────────────────┘│
│                                      │
└─────────────────────────────────────┘
[═══Dashboard═══][Inbox][Canvas][Agents]
            [🎤 Voice]
```

**Components:**
- `TrinityAppBar`: Custom app bar with connection status
- `AgentSwarmVisualization`: Animated circular layout (CustomPainter)
- `ReputationChart`: Horizontal bar chart
- `ActivityFeed`: Scrollable list of recent events
- `BottomNavigationBar`: 4 tabs
- `FloatingActionButton`: Voice control trigger

**Interactions:**
- Tap agent node → Navigate to Agent Detail
- Tap activity item → Navigate to Task Detail
- Swipe down → Refresh data
- Tap voice button → Show Voice Control modal

---

### 2. Inbox Screen

**Purpose:** Unified view of messages from all channels (WhatsApp, Telegram, Discord, etc.)

**Layout:**
```
┌─────────────────────────────────────┐
│ Inbox                   [Filter Icon]│
├─────────────────────────────────────┤
│ Channels                             │
│ [All] [WhatsApp] [Telegram] [Discord]│
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ 📱 Mobile App                   │ │
│ │ NEXUS: Found 3 vulnerabilities  │ │
│ │ 2 minutes ago                   │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ 💬 WhatsApp                     │ │
│ │ You: Check bitcoin price        │ │
│ │ 15 minutes ago                  │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ 🔵 Telegram                     │ │
│ │ TORCH: Report generated         │ │
│ │ 1 hour ago                      │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
[Dashboard][═══Inbox═══][Canvas][Agents]
```

**Components:**
- `ChannelFilter`: Horizontal scrollable chip list
- `ConversationCard`: Message preview with channel icon
- `MessageList`: Scrollable list with lazy loading

**Interactions:**
- Tap conversation → Open conversation detail view
- Tap filter → Filter by channel
- Long press → Mark as read/unread, delete
- Pull to refresh

---

### 3. Canvas Screen

**Purpose:** Live execution trace visualization (A2UI pattern from OpenClaw)

**Layout:**
```
┌─────────────────────────────────────┐
│ Live Canvas                          │
├─────────────────────────────────────┤
│ Active: NEXUS                        │
│                                      │
│ ┌─────────────────────────────────┐ │
│ │                                  │ │
│ │   [Visual workspace controlled   │ │
│ │    by agent - can render:        │ │
│ │    - Code snippets               │ │
│ │    - Charts/graphs               │ │
│ │    - Web previews                │ │
│ │    - Markdown documents]         │ │
│ │                                  │ │
│ └─────────────────────────────────┘ │
│                                      │
│ Execution Trace                      │
│ ┌─────────────────────────────────┐ │
│ │ 1. Received task [12:00:00]     │ │
│ │ 2. Routed to NEXUS [12:00:01]   │ │
│ │ 3. Web search started [12:00:02]│ │
│ │ 4. LLM synthesis [12:00:03]     │ │
│ │ 5. Proof generated [12:00:04]   │ │
│ │ 6. Completed ✓ [12:00:05]       │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
[Dashboard][Inbox][═══Canvas═══][Agents]
```

**Components:**
- `AgentCanvas`: Dynamic rendering area (WebView or custom painter)
- `ExecutionTrace`: Timeline view of task steps
- `ProofBadge`: zkSTARK proof verification indicator

**Interactions:**
- Tap trace step → Expand details
- Tap proof badge → View proof hash, verification status
- Screenshot button → Capture canvas content

---

### 4. Agents Screen

**Purpose:** Manage and monitor all agents

**Layout:**
```
┌─────────────────────────────────────┐
│ My Agents              [+ Add Agent] │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ HDM                          577 │ │
│ │ Historical Data Manager          │ │
│ │ ●Active  Load: 15%  🟢Healthy   │ │
│ │ [View Details →]                 │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ APM                          631 │ │
│ │ Adaptive Persona Manager         │ │
│ │ ●Active  Load: 23%  🟢Healthy   │ │
│ │ [View Details →]                 │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ NEXUS                        595 │ │
│ │ Network Exploration System       │ │
│ │ ●Active  Load: 8%   🟢Healthy   │ │
│ │ [View Details →]                 │ │
│ └─────────────────────────────────┘ │
│                                      │
│ (Scroll for 5 more agents...)       │
└─────────────────────────────────────┘
[Dashboard][Inbox][Canvas][═══Agents═══]
```

**Components:**
- `AgentCard`: Summary card with status indicators
- `AgentList`: Scrollable list
- `AddAgentButton`: FAB or header button

**Interactions:**
- Tap agent card → Navigate to Agent Detail
- Tap "+ Add Agent" → Agent registration flow
- Long press → Quick actions (pause, delete)

---

### 5. Agent Detail Screen

**Purpose:** Deep dive into single agent's performance, history, settings

**Layout:**
```
┌─────────────────────────────────────┐
│ [←] NEXUS                            │
├─────────────────────────────────────┤
│ Network Exploration & Understanding  │
│                                      │
│ Reputation: 595 / 10,000             │
│ ████████████████░░░░░░░░░░░░         │
│                                      │
│ ┌─── Performance ──────────────────┐│
│ │ Tasks Completed: 127              ││
│ │ Success Rate: 94.2%               ││
│ │ Avg Quality: 87                   ││
│ │ Avg Response: 2.1s                ││
│ └───────────────────────────────────┘│
│                                      │
│ ┌─── Skills ───────────────────────┐│
│ │ • Web Search                      ││
│ │ • Data Synthesis                  ││
│ │ • Knowledge Integration           ││
│ └───────────────────────────────────┘│
│                                      │
│ ┌─── Recent Tasks ─────────────────┐│
│ │ Find Web3 vulnerabilities         ││
│ │ Quality: 92  Time: 3.2s  ✓        ││
│ │ ─────────────────────────────────││
│ │ Search AI trends 2026             ││
│ │ Quality: 85  Time: 2.8s  ✓        ││
│ └───────────────────────────────────┘│
│                                      │
│ [Pause Agent] [View Full History]   │
└─────────────────────────────────────┘
```

**Components:**
- `ReputationBar`: Visual representation of RepID
- `PerformanceMetrics`: Grid of stat cards
- `SkillList`: List of agent capabilities
- `RecentTasksList`: Compact task history
- `ActionButtons`: Pause, history, settings

---

### 6. Settings Screen

**Purpose:** App configuration, account management

**Layout:**
```
┌─────────────────────────────────────┐
│ [←] Settings                         │
├─────────────────────────────────────┤
│ Account                              │
│ ┌─────────────────────────────────┐ │
│ │ sean_mccullough                  │ │
│ │ sean@aitrinitysymphony.com       │ │
│ │ SBT: 0x1234...5678               │ │
│ │ [Edit Profile]                   │ │
│ └─────────────────────────────────┘ │
│                                      │
│ Network                              │
│ ┌─────────────────────────────────┐ │
│ │ Gateway URL                      │ │
│ │ wss://gateway.aitrinitysymphony..│ │
│ │ [Change]                         │ │
│ ├─────────────────────────────────┤ │
│ │ HyperDAG RPC                     │ │
│ │ https://rpc.hyperdag.org         │ │
│ │ [Change]                         │ │
│ └─────────────────────────────────┘ │
│                                      │
│ Features                             │
│ ┌─────────────────────────────────┐ │
│ │ Voice Control        [Toggle ON] │ │
│ │ Notifications        [Toggle ON] │ │
│ │ Auto-sync Reputation [Toggle ON] │ │
│ └─────────────────────────────────┘ │
│                                      │
│ Billing                              │
│ ┌─────────────────────────────────┐ │
│ │ Plan: Pro ($20/month)            │ │
│ │ HDG Balance: 150.25              │ │
│ │ [Add Funds]  [View History]      │ │
│ └─────────────────────────────────┘ │
│                                      │
│ [Sign Out]                           │
└─────────────────────────────────────┘
```

---

### 7. Voice Control Modal

**Purpose:** Voice-based task submission (OpenClaw-inspired)

**Layout:**
```
┌─────────────────────────────────────┐
│ Voice Control              [✕ Close]│
│                                      │
│          ┌─────────┐                │
│          │         │                │
│          │    🎤   │                │
│          │         │                │
│          └─────────┘                │
│                                      │
│        Tap and hold                 │
│         to speak                    │
│                                      │
│ ┌─────────────────────────────────┐ │
│ │ Your speech will appear here... │ │
│ │                                  │ │
│ │                                  │ │
│ └─────────────────────────────────┘ │
│                                      │
│ Quick Actions:                       │
│ [Check status] [Run analysis]        │
│ [Generate report] [Search web]       │
│                                      │
└─────────────────────────────────────┘
```

**Interactions:**
- Press and hold microphone → Start listening
- Release → Stop and process
- Tap quick action → Execute preset command

---

## User Flows

### Flow 1: First-Time Setup
```
Launch App
  → Splash Screen (2s)
  → Welcome Screen
    → Swipe through feature slides
    → Grant permissions (mic, notifications)
    → Sign up with email
    → Verify email
    → Connect HyperDAG SBT
    → Dashboard (tutorial overlays)
```

### Flow 2: Submit Task via Voice
```
Dashboard
  → Tap voice FAB
  → Voice Control Modal opens
  → Hold mic, speak: "Find Web3 security news"
  → Release mic
  → Speech recognized, displayed
  → Task sent to gateway
  → Routed to NEXUS
  → NEXUS executes
  → Result appears in Inbox
  → Notification: "NEXUS completed your task"
```

### Flow 3: Monitor Agent Performance
```
Dashboard
  → Tap NEXUS agent node
  → Agent Detail screen
  → View reputation chart
  → Scroll to recent tasks
  → Tap task
  → Task Detail (quality score, proof hash)
  → Tap proof hash
  → Verification modal (zkSTARK proof details)
```

### Flow 4: Bridge Agent to Ethereum
```
Agents screen
  → Tap agent card
  → Agent Detail
  → Scroll to bottom
  → [Bridge to Ethereum] button
  → Bridge Configuration:
    - Select chain (Arbitrum / Optimism / Base)
    - Review gas estimate
    - Confirm
  → Transaction submitted
  → Progress indicator
  → Success: "Agent bridged to Arbitrum"
  → View on Arbiscan link
```

---

## Design Tokens

```yaml
Colors:
  Primary: #5E5CE6 (Purple)
  Secondary: #30D5C8 (Teal)
  Accent: #FF6B6B (Coral)
  Background: #0A0A0A (Dark mode)
  Surface: #1C1C1E
  On Surface: #FFFFFF
  Success: #32D74B
  Warning: #FF9F0A
  Error: #FF3B30
  
Typography:
  Headline Large: Montserrat Bold 32sp
  Headline Medium: Montserrat Bold 24sp
  Title Large: Montserrat SemiBold 20sp
  Body Large: Roboto Regular 16sp
  Body Medium: Roboto Regular 14sp
  Label Small: Roboto Medium 12sp
  
Spacing:
  xs: 4dp
  sm: 8dp
  md: 16dp
  lg: 24dp
  xl: 32dp
  
Border Radius:
  small: 8dp
  medium: 12dp
  large: 16dp
  pill: 9999dp
  
Shadows:
  low: 0 1px 3px rgba(0,0,0,0.12)
  medium: 0 4px 6px rgba(0,0,0,0.16)
  high: 0 10px 20px rgba(0,0,0,0.19)
```

---

## Accessibility

```yaml
Requirements:
  - All interactive elements min 44x44 touch target
  - Contrast ratio 4.5:1 for text
  - Screen reader labels for all icons
  - Haptic feedback for important actions
  - Dynamic type support (scale text)
  - Reduce motion option
  - Color blind friendly palette
```

---

## Export Formats

For actual design implementation:
1. Figma: https://figma.com/file/[design-file-id]
2. SVG assets: `/assets/icons/`
3. Lottie animations: `/assets/animations/`

---

**END OF WIREFRAMES**

Next: Complete Smart Contract Suite
