# skill-hints

With many skills installed it is hard to remember which one fits the task at hand. This plugin asks a small model which installed skill fits each prompt you type, and shows the answer while Claude works.

## How it works

When you send a prompt of 15 characters or more, the plugin sends the list of installed skills and plugin commands, with their descriptions, plus your prompt to Haiku and asks which one fits, or none. The call runs beside the turn, so it never delays the prompt.

When a skill fits:

- a toast names its command, for example `Skill that fits: /humanizer`;
- the plugin's status line under the prompt shows `skill: humanizer` until the next prompt.

A prompt with no match clears the status line. Built-in commands, MCP commands and router skills (`ask-matt`) are never suggested.

`/skill-hints` opens a pane that lists every skill by plugin, with the one that fit your last prompt on top. Esc closes it.

Slash commands, short replies such as "yes, go on", and prompts that a task or the SDK sent get no hint.

## Cost

One Haiku call per prompt. The request holds every skill's description, cut to 220 characters, so it grows by about 60 tokens per installed skill. With 50 skills that is about 3,000 tokens per prompt.

## Install

```sh
claude plugin marketplace add lbzepoqo/claude-plugins
claude plugin install skill-hints@lbzepoqo
```

Restart Claude Code.

## Develop

```sh
claude plugin validate .
claude plugin test .
```
