# EXECUTE Protocol - Performing Work

1. Read task description and expected_output from /task_templates/{TASK_TYPE}.md.
2. **Review `docs/STARTUP_DOCTRINE.md`**: Enforce Accelerator Principles (User Talks, Tight Loops) and Required Deliverables (Trust Cards, Weekly Updates).
3. Determine required artifact type (e.g., MD, PDF, code file).
3. Perform substantive work — reference Bible/Blueprint context for ethics.
4. **Create Artifact**:
   - **PRIMARY TOOL**: Call `save_artifact` (Implicit) to finalize your mission result. This ensures the artifact appears in the Library instantly.
   - **SECONDARY TOOL**: Call `write_file` (FileSystemMCP) for internal drafts or large datasets. Always provide `taskId` to maintain the chain of trust.
   - Filename/Title format: `[PROJECT] [TYPE] [DATE]` (e.g., `SocialMirror Design Doc 2025-01-05`).
5. If evergreen, prepare data for next loop iteration.
6. Enforce minimum duration per task type (e.g., research ≥10 min).

## Minimum Durations
| Task Type | Minimum |
|-----------|---------|
| Code | 10 min |
| Research | 15 min |
| Content | 10 min |
| Review | 5 min |
| General | 3 min |

Proceed to COMPLETE when finished.
