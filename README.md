# claude-plugins

Plugins for Claude Code.

| Plugin | What it does |
|---|---|
| [compact-timing](plugins/compact-timing) | Compacts the conversation at task boundaries instead of at a fixed token count |
| [skill-hints](plugins/skill-hints) | Shows which installed skill fits each prompt you type |
| [topic-nudge](plugins/topic-nudge) | Reminds you to /clear when a prompt starts a different topic |
| [grounded](plugins/grounded) | Output style: answer first, keep every figure, say what was checked |

## Install

```sh
claude plugin marketplace add lbzepoqo/claude-plugins
claude plugin install <plugin>@lbzepoqo
```
