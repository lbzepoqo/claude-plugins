# session-search

Claude Code keeps every session as a transcript under `~/.claude/projects`, but a new session cannot see them. When you ask "what did we decide about X last week?", Claude has to guess, or you have to find the session yourself.

This plugin gives Claude two tools over those transcripts:

- `search_sessions` finds past sessions on this machine that mention your words. It lists them by their newest match, each with its id, the dates of its matches, folder, first prompt and up to 3 short snippets.
- `read_session` shows the messages of one session around a timestamp or snippet from a search result, 300 characters each.

Nothing is indexed, summarized or loaded at session start. Each search reads the raw transcripts when Claude calls it.

## How it works

- `search_sessions` runs `rg` (ripgrep) or, when that is missing, `grep` over every `*.jsonl` transcript, including subagent transcripts, and parses only the lines that match. A query is words that must all occur somewhere in one session, a `"quoted phrase"`, or a `/regex/`. A regex is first run over the raw JSON lines, so `^`, `$` and line breaks inside it match nothing; words are the surer form. Optional filters: `project` (a folder prefix or name), `since` (a date, `7d` or `12h`), `limit` (10 by default, at most 50).
- Your prompts, Claude's replies and tool inputs (the commands and paths) are searched. Tool output is searched only with `includeResults`, since logs and file dumps mention almost everything. Text that Claude Code adds to a prompt (skill and hook text, system reminders, local command output) is not searched.
- The current session is left out.
- `read_session` finds its place with the same search tool, so a 300 MB transcript is never read whole. It shows the records the way the continue-session skill in [this gist](https://gist.github.com/Tomcc/b7b0f348b1628ad94bdef918e449b330) does: each message's text, and each tool call's command or path, joined and cut at 300 characters. Tool output is not shown.
- Secrets in the output are replaced with a tag naming the kind of secret, using the patterns of the [secret-guard](../secret-guard) plugin.

## Options

`extraRoots` (default empty): more transcript folders, separated by `;`. Use it to search the sessions of your other OS too: `/mnt/c/Users/<you>/.claude/projects` from WSL, or `\\wsl.localhost\Ubuntu\home\<you>\.claude\projects` from Windows.

`loadTools` (default false): put both tools in every request instead of behind tool search.

```sh
echo '{"extraRoots": "/mnt/c/Users/me/.claude/projects"}' | claude plugin configure session-search@lbzepoqo --values-stdin
```

## Cost

No model calls. Behind tool search (the default), the two tool names add about 50 tokens to each request; with `loadTools` the full definitions add about 500 (measured as the change in a request's input tokens). Results are capped: a search shows at most 3 snippets of about 200 characters per session, and `read_session` at most 11 messages of 300 characters by default. Measured: a 10-session search result was 8,700 characters and a default `read_session` result 3,100 (roughly 2,200 and 800 tokens).

Search time on my machine, measured through Claude Code with the files already in the OS cache (runs repeated back to back; a cold first run was not measured):

| Where | Transcripts | Searcher | Time |
|---|---|---|---|
| Windows, own sessions | 140 (about 150 MB) | rg | 0.1 s |
| WSL, own sessions | 891 (1.6 GB) | grep | 1.0 s; 3.0 s for a word in 145 sessions |
| WSL, plus Windows sessions over `/mnt/c` | 1,031 | grep | 2.5 to 2.7 s |
| Windows, plus WSL sessions over `\\wsl.localhost` | 1,031 | rg | 7.2 to 7.4 s |

Reading WSL files from Windows is the slow case; from WSL, both sets take 2.5 s. No index is needed at this size.

Requires `rg` or GNU `grep` on the PATH (macOS's grep lacks the options used). Windows has no `grep` on the PATH by default; install ripgrep (`winget install BurntSushi.ripgrep.MSVC`).

## In daily use

I asked 11 questions about my own past sessions of the last four weeks in plain words, such as "Find the session where we got rid of that ban list" or "Did we ever look at that project to see if it clashes with my setup?" (with the real names), through `claude -p` with Haiku and only these two tools. Each answer had to end with the id of one session. In all 11 it was the session I had in mind, after 1 to 6 tool calls and 12 to 31 seconds; in 9 Claude also read part of it.

These are the easy case: I wrote each question from a session's first prompt, so the question shares words with it. A question in words the session never used finds nothing, since there is no semantic search.

## Install

```sh
claude plugin marketplace add lbzepoqo/claude-plugins
claude plugin install session-search@lbzepoqo
```

Restart Claude Code.

## Develop

```sh
claude plugin validate .
claude plugin test .
```
