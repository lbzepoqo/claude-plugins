# compact-timing

Claude Code compacts a conversation when it reaches a fixed token count. That can happen in the middle of a debugging session, when the details exist only in the conversation. It can also happen long after a task ended, when compacting would have lost nothing.

This plugin lets the model choose the moment. The model sets a mark when it finishes a task or starts a step that must not be compacted, and the plugin compacts at the end of a turn when the mark and the context size allow it.

## How it works

The plugin gives the model a tool, `mark`, with two inputs: the state, and a focus that says what the summary must keep. The focus is passed to the compaction as its instructions.

| Mark | Meaning | The plugin compacts at the end of the turn when the context contains |
|---|---|---|
| `boundary` | A task is done and its state is saved (committed, or in a plan file) | 200k tokens or more |
| none | No mark since the last compaction | 300k tokens or more |
| `busy` | A step is in progress whose details exist only in the conversation | never |

The token counts in the table are the defaults of `boundaryTokens` and `softTokens` (see Settings).

A `boundary` mark counts only at the end of the turn in which the model set it. The plugin drops the mark when that turn ends, also when it did not compact, so the mark cannot cause a compaction later in the middle of other work. When you interrupt the turn, the plugin drops the mark and does not compact. A `busy` mark stays until the model replaces it. Any compaction clears the mark. Each session has its own mark.

After a `git commit`, the plugin reminds the model to set the mark when the context has reached `boundaryTokens`, or when the mark is `busy`. A commit is the most common task boundary, and without the reminder the model often forgets the tool. Below `boundaryTokens` a `boundary` mark has no effect, so without a `busy` mark there is no reminder.

A `busy` mark that is never replaced stops the plugin from compacting. Claude Code's own automatic compaction still runs at `autoCompactWindow`. Keep that setting above 300k, for example:

```json
{ "autoCompactWindow": 500000 }
```

## Install

```sh
claude plugin marketplace add lbzepoqo/claude-plugins
claude plugin install compact-timing@lbzepoqo
```

Restart Claude Code.

## Settings

| Option | Default | Meaning |
|---|---|---|
| `boundaryTokens` | 200000 | Context size at which a `boundary` mark causes compaction |
| `softTokens` | 300000 | Context size at which the plugin compacts when there is no mark |

Change them with `/plugin configure compact-timing@lbzepoqo` in Claude Code, or from the shell:

```sh
echo '{"boundaryTokens": "150000"}' | claude plugin configure compact-timing@lbzepoqo --values-stdin
```

## Limits

- In a test, Opus, Sonnet and Haiku each set `boundary` with a useful focus after they committed a bug fix. None of them set `busy` while it searched for the bug. Without the commit reminder, Opus set no mark at all.
- Headless sessions (`claude -p`, the SDK) cannot compact from a plugin yet. In these sessions the plugin shows a "compaction failed" message and nothing else changes.

## Develop

```sh
claude plugin validate .
claude plugin test .
```
