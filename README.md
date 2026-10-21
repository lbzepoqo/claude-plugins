# claude-plugins

Plugins for Claude Code.

## Output styles

An output style changes how Claude writes its replies. It is text only: nothing runs, and it costs no extra model calls. Pick it with `/config` after installing.

| Plugin | What it does |
|---|---|
| [grounded](plugins/grounded) | Replies open with the answer, keep every figure, do the next step when Claude can, and say what was checked |

## Session plugins

These run code inside Claude Code and change how a session behaves: when it compacts, what it shows you after a prompt.

| Plugin | What it does | Adds | Model calls |
|---|---|---|---|
| [compact-timing](plugins/compact-timing) | Compacts at task boundaries instead of at a fixed token count | A `mark` tool for the model, a toast when a compaction is skipped or fails | None besides the compaction it triggers |
| [skill-hints](plugins/skill-hints) | Shows which installed skill fits each prompt you type | Toast, status line, `/skill-hints` pane | One Haiku call per prompt |
| [topic-nudge](plugins/topic-nudge) | Reminds you to `/clear` when a prompt starts a different topic | Toast | One Haiku call per prompt after the first |

## Install

```sh
claude plugin marketplace add lbzepoqo/claude-plugins
claude plugin install <plugin>@lbzepoqo
```

Restart Claude Code after installing. Each plugin works on its own; install only the ones you want.
