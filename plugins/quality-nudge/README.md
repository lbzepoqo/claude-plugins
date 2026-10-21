# quality-nudge

Reminds Claude to review its own code before it calls the work done. After a `git commit` whose changes no review saw, the tool result gets a short note: run `/code-review`, and `/simplify` as well for a large change, or say why the review does not apply. It never blocks a commit or a push.

## When it reminds

- **30 or more changed code lines** (added plus deleted, code files only) in a commit, and `/code-review` did not run while those changes were made.
- **Any change to guard code**, at any size: a file under a folder whose name contains `guard`, or under `git-hooks/`. A few changed lines in a pattern can open a gap.
- **300 or more lines:** `/simplify` is asked for too, since a large diff can crowd the cleanup angles out of code-review's findings.

A review counts for every commit whose parent was written before the review ran, so fix commits made after a review are not reminded again. A review counts only for the repository of the session's working directory, and a review call that was denied or failed does not count. `wip:` commits are skipped. Commits are found from the Bash tool's git report and the reflog, so a commit made by an alias or a script is seen too.

## Options

Change them with `/plugin configure quality-nudge@lbzepoqo` in Claude Code, or from the shell:

```sh
echo '{"reviewLines": "50"}' | claude plugin configure quality-nudge@lbzepoqo --values-stdin
```

| Option | Default | Meaning |
|---|---|---|
| `reviewLines` | 30 | Changed code lines that call for `/code-review` |
| `simplifyLines` | 300 | Changed code lines that call for `/simplify` as well |

## Install

```sh
claude plugin marketplace add lbzepoqo/claude-plugins
claude plugin install quality-nudge@lbzepoqo
```

Restart Claude Code.

## Cost

No model calls. After a commit it runs a few `git` commands (log, diff-tree) to measure the change.
