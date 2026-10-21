# skill-hints

With many skills installed it is hard to remember which one fits the task at hand. This plugin asks a small model which installed skill fits each prompt you type, and shows the answer while Claude works.

## How it works

When you send a prompt of 15 characters or more, the plugin sends the list of installed skills and plugin commands, with their descriptions, plus your prompt to Haiku and asks which one fits, or none. The call runs beside the turn, so it never delays the prompt.

When a skill fits:

- a toast names its command, for example `Skill that fits: /humanizer`;
- the plugin's status line under the prompt shows `skill: humanizer` until the next prompt.

A prompt with no match clears the status line. Built-in commands and MCP commands are never suggested.

## The pane

`/skill-hints` opens a pane with every skill, grouped by plugin:

- the skill that fit your last prompt sits on top, with the prompt and how long ago you sent it;
- type to filter by name, description or plugin, and press Enter to use the first match;
- Tab to any skill and press Enter to put its command in front of what you have typed in the prompt box.

Esc closes the pane. The Claude mobile app has no text field yet, so it shows the list without the filter.

## Options

`hiddenSkills`: skills never suggested, by full or short name, comma separated. Useful for a router skill whose description fits every prompt. Change it with `/plugin configure skill-hints@lbzepoqo` in Claude Code, or from the shell:

```sh
echo '{"hiddenSkills": "my-router-skill"}' | claude plugin configure skill-hints@lbzepoqo --values-stdin
```

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
