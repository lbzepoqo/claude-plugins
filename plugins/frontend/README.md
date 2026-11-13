# frontend

Two skills for UI work, and a browser checker the second one runs. Each skill loads only when its description matches what you ask.

| Skill | Loads when | What it asks for |
|---|---|---|
| `ui-design-start` | Before a new or reworked screen, panel or dialog | The question the screen answers, two or three structures that differ in a product decision, HTML mockups at 360, 1366, 1536 and 1920 with real data sizes, and the user's pick before any code |
| `ui-ux-pass` | Building, changing or reviewing UI code, a UI ticket or a UI pass | Read the project first, audit the task flow (clicks, pointer travel, round trips), build every state, sweep each defect into a shared fix and a test, then check the page in a browser and against its mockup |

## The checker

`skills/ui-ux-pass/scripts/check_ui.mjs` opens one page in Chromium, at 360, 1366 and 1920 by default, in light and optionally dark. It saves screenshots and prints a JSON report:

- console errors;
- sideways page overflow, and elements whose content is wider than their box;
- controls without a name, or with one name shared by several;
- inputs without a label, and images without alt or size;
- clickable elements that are not buttons or links;
- a Tab walk listing stops with no visible focus;
- axe-core's WCAG 2.2 AA results, when the project has axe-core.

It takes a Playwright storage state file (`--storage-state`) for pages behind a sign-in. It needs Node 18+ and Playwright from the project or a global install; run it from the project folder. Point it only at your own dev or preview server.

## Lessons per project

The skills ship general defect classes. Each project keeps its own in a UI lessons file: the path its CLAUDE.md names, else `docs/ui-lessons.md`. The skills read it first and add a line when a sweep finds a new class, so a plugin update never overwrites what a project learned.

## Install

```sh
claude plugin marketplace add lbzepoqo/claude-plugins
claude plugin install frontend@lbzepoqo
```

Restart Claude Code. The skills show up as `frontend:ui-design-start` and `frontend:ui-ux-pass`.

## Cost

No model calls and no hooks. Claude Code reads the two descriptions (about 175 words together) with each request, and a skill's full text only when it loads.

## Credits

The checker, the review checklist, and the read-first step, states table and report in `ui-ux-pass` are adapted from [claude-code-templates](https://github.com/davila7/claude-code-templates)' senior-frontend skill (commit 7ae495d, MIT). The other sources are listed at the end of each skill and in `skills/ui-ux-pass/references/NOTICE.md`.
