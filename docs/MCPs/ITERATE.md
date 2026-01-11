---
description: Build-Measure-Learn Iteration Protocol
---

# ITERATE PROTOCOL

**Trigger**: Applied when a task requires creating something new (Feature, MVP, Content) or improving an existing artifact.

## Core Philosophy: "Build, Measure, Learn"
Agents must not just "do" the task, but properly frame it within a validation cycle.

## Phases

### 1. CONCEPT (The "Idea")
- **Goal**: Define *what* we are building and *why*.
- **Tools**: `research_tool`, `gather_wisdom`
- **Output**: A clear `spec.md` or `brief.md` artifact.
- **Check**: Does this align with the project's Mission (e.g. Truth, Impact)?

### 2. DESIGN (The "Blueprint")
- **Goal**: Visualize the solution before coding.
- **Tools**: `figma_tool` (if available), `canvas_generator`
- **Output**: A `mockup.png` or `wireframe.svg` or CSS Design Tokens.
- **Check**: Is it intuitive? Does it look "Premium"?

### 3. BUILD (The "Code")
- **Goal**: Implement the MVP.
- **Tools**: `write_file`, `exec_command`
- **Output**: Functional code or content.
- **Check**: Does it compile? Does it run?

### 4. MEASURE (The "Validation")
- **Goal**: Test assumptions.
- **Tools**: `browser_tool` (Simulate User), `chaos_test`
- **Output**: A `test_report.md` or `validation_log.json`.
- **Check**: Did it solve the user's problem? What friction remains?

### 5. LEARN (The "Pivot")
- **Goal**: Decide next steps.
- **Tools**: `generate_task`
- **Output**: New Tasks.
    - If Success: "Scale User Base", "Add Feature Y"
    - If Failure: "Pivot to Approach B", "Fix Bug X"

## Recursive Rule
**NEVER** mark an ITERATE task as complete without spawning at least one follow-up task (The "Learn" output). This ensures the loop never dies.
