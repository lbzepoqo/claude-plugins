# Third-party notices

Parts of this skill come from the projects below. Each is under the MIT License, reproduced once at the end of this file.

| Project | Commit | Copyright | Used in |
|---------|--------|-----------|---------|
| [davila7/claude-code-templates](https://github.com/davila7/claude-code-templates) (`cli-tool/components/skills/development/senior-frontend`) | 7ae495d | Copyright (c) 2025 Daniel (San) Ávila | `scripts/check_ui.mjs` and `scripts/page-audit.mjs` (adapted: wider default widths, color schemes, a signed-in session, overflow inside elements, a focus-walk fix), `references/ui-checklist.md` (copied), and in `SKILL.md` the read-first step, the states table, the platform rules and the closing report |
| [vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines) | 434b7f9 | Copyright (c) 2025 Vercel Labs | `ui-checklist.md`, through claude-code-templates |
| [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills) (`accessibility`) | afa8da9 | Copyright (c) 2026 Addy Osmani | `ui-checklist.md` (WCAG 2.2 additions), through claude-code-templates |

`scripts/guides.mjs` searches [GoogleChrome/modern-web-guidance](https://github.com/GoogleChrome/modern-web-guidance) (Apache License 2.0, Copyright Google LLC) in a clone it makes on the user's machine. None of its files are copied into this plugin.

The flow audit, the sweep and the mockup check in `SKILL.md` draw on the sources its last section lists.

## MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
