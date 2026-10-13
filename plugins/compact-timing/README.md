# compact-timing

Claude Code compacts a conversation when it reaches a fixed token count. That can happen in the middle of a debugging session, when the details exist only in the conversation. It can also happen long after a task ended, when compacting would have lost nothing.

This plugin lets the model choose the moment. The model writes a short mark when it finishes a task or starts a step that must not be compacted, and the plugin compacts at the end of a turn when the mark and the context size allow it.

## How it works

The model writes `~/.cache/compact-timing/mark.md` with the Write tool. The first line is the mark. The lines after it say what the summary must keep, and they are passed to the compaction as its instructions.

| Mark | Meaning | The plugin compacts at the end of the turn when the context contains |
|---|---|---|
| `boundary` | A task is done and its state is saved (committed, or in a plan file) | 200k tokens or more |
| none | No mark since the last compaction | 300k tokens or more |
| `busy` | A step is in progress whose details exist only in the conversation | never |

Any compaction clears the mark.

The plugin adds the mark rules to the model's context, so you do not need to change CLAUDE.md. The plugin reads the mark from the Write call, not from the file. For this reason two sessions that share the file do not see each other's marks.

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
| `stateFile` | `.cache/compact-timing/mark.md` | The mark file, relative to the home folder |

Change them with `/plugin configure compact-timing@lbzepoqo` in Claude Code, or from the shell:

```sh
echo '{"boundaryTokens": "150000"}' | claude plugin configure compact-timing@lbzepoqo --values-stdin
```

## Limits

- Tested with Opus: it writes marks without being asked. Haiku did not write marks in two tests. Sonnet is not tested. A model that writes no marks is compacted only at the 300k limit.
- Headless sessions (`claude -p`, the SDK) cannot compact from a plugin yet. In these sessions the plugin shows a "compaction failed" message and nothing else changes.

## Develop

```sh
claude plugin validate .
claude plugin test .
```
