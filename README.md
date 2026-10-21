# claude-plugins

Plugins for Claude Code.

## Output styles

An output style changes how Claude writes its replies. It is text only: nothing runs, and it costs no extra model calls. Pick it with `/config` after installing.

| Plugin | What it does |
|---|---|
| [grounded](plugins/grounded) | Replies open with the answer, keep every figure, do the next step when Claude can, and say what was checked |

## Skills

A skill is a set of instructions Claude loads when your request matches its description. Text only: nothing runs, and it costs no extra model calls.

| Plugin | What it does |
|---|---|
| [working-method](plugins/working-method) | Four skills for how Claude works: hard multi-step tasks, CLAUDE.md upkeep, surviving a usage limit, git worktrees |

## Session plugins

These run code inside Claude Code and change how a session behaves: when it compacts, what it shows you after a prompt.

| Plugin | What it does | Adds | Model calls |
|---|---|---|---|
| [compact-timing](plugins/compact-timing) | Compacts at task boundaries instead of at a fixed token count | A `mark` tool for the model, a toast when a compaction is skipped or fails | None besides the compaction it triggers |
| [skill-hints](plugins/skill-hints) | Shows which installed skill fits each prompt you type | Toast, status line, `/skill-hints` pane | One Haiku call per prompt |
| [secret-guard](plugins/secret-guard) | Hides API keys and private keys before Claude reads them, and blocks credential files and commands that print secrets (fork of arasovic/claude-code-mods) | Status light under the prompt | None |
| [quality-nudge](plugins/quality-nudge) | Reminds Claude to run code-review after a commit no review saw (30+ code lines, or any guard code) | A note in the commit's tool result | None |
| [topic-nudge](plugins/topic-nudge) | Reminds you to `/clear` when a prompt starts a different topic | Toast | One Haiku call per prompt after the first |
| [memory-hints](plugins/memory-hints) | Points Claude to the saved memory notes that match each prompt you type | A note in the prompt's context | None |
| [plugin-updates](plugins/plugin-updates) | Tells you when installed plugins or copied skills fall behind upstream, without updating them | Status line, toast, `/plugin-updates` list | None |

## Install

```sh
claude plugin marketplace add lbzepoqo/claude-plugins
claude plugin install <plugin>@lbzepoqo
```

Restart Claude Code after installing. Each plugin works on its own; install only the ones you want.
