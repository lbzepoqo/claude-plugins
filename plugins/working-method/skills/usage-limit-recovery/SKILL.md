---
name: usage-limit-recovery
description: How to leave work safe to interrupt (plan file, wip commit, memory) and how to resume it in a new session, with checkpoint markers in plan files. Use when writing or updating a plan file in ~/.claude/plans, when a usage limit may hit, when making a wip commit, or when resuming interrupted work.
---

# Usage Limit Survival

Three things on disk = safe interruption:
1. **Plan file** (for example `~/.claude/plans/<task>.md`): must include `Project: /absolute/path` in the first line so it can be matched to the active working directory. Update with a "Resume Notes" section before stopping: what's done, what's next, any gotchas.
2. **WIP commit:** commit even broken state with a `wip:` prefix rather than leave uncommitted changes when a limit might hit. Squash `wip:` commits into a real commit before pushing, so the pushed history stays bisectable.
3. **Memory:** write non-obvious decisions to project memory, not task state.

Recovery sequence for a new session: `git log --oneline -20`, then `git status` + `git diff`, then read the active plan file, then check MEMORY.md.

## Checkpoint Markers in Plan Files
After completing each section of a plan, edit the plan file in-place to mark progress:
- Completed: add ✓ to the heading, e.g. `### 1. Drop dashboard package ✓`.
- In progress: add a marker to the heading, e.g. `### 2. Plugin dependency declaration ← IN PROGRESS`.
- Update `## Resume Notes` after every commit: one line per completed section + one "NEXT:" line.

This means a new session can read the plan file alone and know exactly where to pick up, without guessing from git log.
