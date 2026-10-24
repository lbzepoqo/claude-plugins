# grounded

An output style for Claude Code. Replies open with the answer, keep every figure you need, do the next step themselves when they can, and say what was checked and what is assumed.

## What it asks for

- **Answer first.** The first sentence answers the question or states the outcome. A simple question gets one to three sentences.
- **Keep the figures.** Shortening cuts repetition and narration, never numbers, versions, names or qualifiers.
- **Do the work.** When the next step is something Claude can run or read, it does it and reports the result, instead of handing you the step.
- **Say what was checked.** A cause that was not confirmed is called a hypothesis, with the evidence that would confirm it.
- **Questions at the end.** Claude takes sensible defaults and says so. Real questions go in a numbered list at the end, each with a recommendation and what it is based on. A decision that is yours comes as a multiple-choice question (AskUserQuestion) with the recommended option first.
- **Actions up top.** When you have something to do, the reply opens with a `▶ Your move` list. Long replies get a TL;DR.
- **Plain format.** Full file paths the terminal can open, issues and PRs as full links with a few words on what they are, no em or en dashes.

The full text is in [output-styles/grounded.md](output-styles/grounded.md).

## Install

```sh
claude plugin marketplace add lbzepoqo/claude-plugins
claude plugin install grounded@lbzepoqo
```

Then pick it: run `/config` and choose **grounded** under Output style, or set it in `~/.claude/settings.json`:

```json
{
  "outputStyle": "grounded:grounded"
}
```

Restart Claude Code if the style does not show up.

## Coding instructions and the shorter system prompt

A custom output style replaces Claude Code's built-in software engineering instructions (how to scope changes, write comments, verify work). This style sets `keep-coding-instructions: true`, so they stay.

That setting only matters on the full system prompt. Newer models get a shorter system prompt by default, which does not include those instructions at all, so there the setting has no effect. To get the full prompt on any model, set:

```sh
export CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT=0
```

See [How output styles work](https://code.claude.com/docs/en/output-styles#how-output-styles-work) and the [environment variables](https://code.claude.com/docs/en/env-vars) page.

## Cost

The style is about 1,250 words, sent with every request. Prompt caching covers it after the first request of a session.

## Evals

The [evals](evals) folder has 10 cases: simple questions, figures that must survive, derived figures, an unchecked cause, a correction, defaults over questions, finding a bug with tools, and others.

On Opus 5.5 most cases score near the top with or without the style, since the model already does much of this. The clearest differences were shorter answers to simple questions and file paths written plain instead of in code font.

```sh
claude plugin eval .
```

A full run makes several model calls per case, so check your usage first.
