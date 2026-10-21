# memory-hints

Claude Code's auto memory loads only the `MEMORY.md` index into each session: one line per note. The notes themselves are read only when Claude decides to open one, and a one-line index entry is easy to pass over. In my sessions Claude opened 15 distinct topic notes in a month, out of more than 200.

This plugin looks at each prompt you type and finds the saved notes that match it. It adds their paths to the prompt's context and asks Claude to read a note before acting when its description fits, and to say in one line, as `(memory: <name>)`, when a note changes what it does.

## How it works

- The memory folder is the one the session's context breakdown lists for the `MEMORY.md` index. The plugin reads the `name` and `description` frontmatter of every other `.md` file there, and reads a file again only when it changes.
- A note matches when it shares at least 2 words with your prompt. Each shared word scores by how rare it is among your notes, so a word most notes contain counts for little. At most 2 notes above the minimum score are hinted per prompt, and each note at most once per session.
- Pasted content and fenced code blocks are left out of the match, since logs and exports name many records and fields.
- Slash commands, `claude -p` and SDK prompts, and prompts that a task, a scheduled trigger or the engine sent are not matched. `/clear` starts the once-per-session count over.

On a month of my own prompts at the default score of 8, 3% of prompts got a hint in one memory folder and 24% in another, and the first hinted note fit the request in 24 of 30 sampled prompts.

## Options

`minScore` (default 8): how strongly a note must match. Raise it for fewer, surer hints.

```sh
echo '{"minScore": "10"}' | claude plugin configure memory-hints@lbzepoqo --values-stdin
```

## Cost

No model calls. Each hinted note adds about 50 tokens to the prompt, plus the Read when Claude opens it.

## Install

```sh
claude plugin marketplace add lbzepoqo/claude-plugins
claude plugin install memory-hints@lbzepoqo
```

Restart Claude Code.

## Develop

```sh
claude plugin validate .
claude plugin test .
```
