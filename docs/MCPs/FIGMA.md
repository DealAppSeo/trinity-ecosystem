---
description: Figma Design Protocol
---

# FIGMA PROTOCOL

**Trigger**: When assigned a design task, UI/UX audit, or visual prototyping request.

## Tools
- `create_design_file(name, description)`: Create a new Figma file.
- `search_figma_community(query)`: Find plugins or templates.
- `inspect_design(file_key)`: Read layers and properties from an existing design.

## Workflow
1.  **Analyze Requirement**: Identify if looking for "Inspiration", "Mockup", or "Design System".
2.  **Search First**: Use `search_figma_community` to find existing verified kits (e.g. Material 3, Tailwind UI).
3.  **Draft**: Use `create_design_file` to initialize the workspace.
4.  **Handoff**: Generate a public link and embed it in the final report.

## Constraints
- Do NOT create private files.
- Always name layers semantically.
- Use Auto-Layout where possible.
