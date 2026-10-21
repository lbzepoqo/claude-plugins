# topic-nudge

A long session that drifts from one topic to the next carries the whole earlier conversation into every request: more tokens, and older context that can mislead the model. Starting unrelated work with `/clear` avoids both, but it is easy to forget once you are typing the next question.

This plugin notices when a prompt starts a different topic and reminds you with a toast:

> New topic? /clear starts a fresh session, or say how it relates to the current work.

## How it works

The plugin keeps your last 5 requests in the session, each cut to 300 characters. When you send a new one, it asks Haiku whether the new request continues the earlier work or starts a different topic. The call runs beside the turn, so it never delays the prompt, and the toast only informs: the prompt goes to Claude either way.

After a new topic, the plugin compares later prompts with the new one only, so you get one toast per switch. `/clear` and a new session start an empty history.

The first prompt of a session, slash commands, short replies such as "yes, go on", and prompts that a task, a scheduled trigger or an SDK host sent are not judged.

## Cost

One Haiku call per prompt after the first, at most about 500 tokens.

## Install

```sh
claude plugin marketplace add lbzepoqo/claude-plugins
claude plugin install topic-nudge@lbzepoqo
```

Restart Claude Code.

## Develop

```sh
claude plugin validate .
claude plugin test .
```
