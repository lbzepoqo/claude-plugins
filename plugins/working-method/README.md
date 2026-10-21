# working-method

Four skills for how Claude works on a task. Each loads only when its description matches what you ask, so an unused skill costs only its one-line description.

| Skill | Loads when | What it asks for |
|---|---|---|
| `hard-task-playbook` | A task has real unknowns: a subtle bug, a multi-file change, an unfamiliar platform | Read before planning, test the riskiest assumption first, verify with evidence before saying "done" |
| `context-docs` | You add to, edit or audit a CLAUDE.md or AGENTS.md | Keep it a map of the code, not a copy; move rules for one situation into a skill |
| `usage-limit-recovery` | A usage limit may hit, or you resume interrupted work | A plan file with resume notes, a `wip:` commit, and a fixed order for picking work back up |
| `worktrees` | You are about to create a git worktree | When one is worth it, where it goes (never `/tmp`), and when to remove it |

## Install

```sh
claude plugin marketplace add lbzepoqo/claude-plugins
claude plugin install working-method@lbzepoqo
```

Restart Claude Code. The skills show up as `working-method:<skill>`.

## Cost

No model calls and no hooks. Claude Code reads the four descriptions (about 190 words together) with each request, and a skill's full text only when it loads.
