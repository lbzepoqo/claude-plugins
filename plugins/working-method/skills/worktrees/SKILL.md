---
name: worktrees
description: When and where to create a git worktree, and when to remove it. Use before creating a worktree, before `claude --worktree`, or when a checkout must stay on one branch while another branch is worked on (a deploy or mirror branch, several branches in flight, two sessions in one repo).
---

# Worktrees

- **Use a worktree when a checkout must stay on one branch while another branch is worked on.** Typical cases: a deploy or mirror branch that a server or a sync job reads from, several branches in flight, or two sessions in the same repo. A repo with one line of work does not need one.
- Put it in a sibling folder (`../<repo>-worktrees/<branch>`), never in `/tmp`, which many systems empty at every boot. Give it its own dependency install.
- `claude --worktree` only creates a new `worktree-<name>` branch from the default branch or HEAD. For an existing branch, use `git worktree add`.
- Remove it when the branch merges. Project-specific layout rules belong in that project's CLAUDE.md.
- Why: a worktree kept in `/tmp` was lost at a reboot, with its uncommitted work.
