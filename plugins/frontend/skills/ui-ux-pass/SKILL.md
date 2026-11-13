---
name: ui-ux-pass
description: How to build, change or review user interface code and run a UI and UX pass. Read the project first, audit the task flow (clicks, navigation, round trips, desktop and phone) before changing a screen, and build every state (loading, empty, error, long content). Make it work with a keyboard and a screen reader, sweep each defect into a shared fix and a test, then check it in a real browser with the bundled checker and against its mockup before saying it is done. Use for any page, component, form, list, table, dialog or styling change, a UI ticket, or a UI review. Use ui-design-start first when the screen is new or reworked.
---

# UI and UX passes: read first, audit the flow, sweep each defect, check the build yourself

A UI change is not done until you have seen it work in a browser, including the unhappy paths. A passing typecheck says nothing about whether a button can be reached with Tab or whether a long name breaks the layout on a phone.

**Read the lessons first.** Start with the project's UI lessons file: the path its CLAUDE.md names for UI lessons, else `docs/ui-lessons.md`. Then read "Known defect classes" at the end. Each line in both is a defect found before.

For a small change inside the existing layout (a label, a color, one field), skip the flow audit in step 2 and do the rest.

## 1. Read the project before you write

- **The stack and its versions:** framework, router, component model, TypeScript strictness.
- **The existing components:** if the project has a `Button`, `Input`, `Dialog` or design-system package, use it. Never hand-roll a second button.
- **The tokens:** colors, spacing, radius and type scale already defined. A new hex value or magic pixel number in a project that has tokens is a bug.
- **The data layer:** the API helpers, loaders or query library, and how errors are already handled.
- **The scripts:** `typecheck`, `lint`, `test`, `build`, `dev`, and the browser tests. You will run them.
- **A sibling page or component** that does something similar. Match its structure, naming and container (dialog, side panel, popover, page).

Ask the user before you add a dependency (UI kit, icon set, state library, date library).

## 2. Audit the flow before changing the look

A UI pass improves how the screen works, not only how it looks. Before editing, write an audit file (outside the repo when it holds real data) with:

- **Who and where:** the people who use the screen, their device (desktop beside another app, phone in the middle of something), and what usually brings them here.
- **Their 3 to 5 real tasks**, most frequent first. For each, count the steps from where they start (another page, a menu, a notification) to done, on desktop and on phone:
  - Count clicks, page changes, sections opened, scroll distance, scrolling back to reach an action, and pointer travel. Measure pointer travel at 1920 wide: how far the mouse goes from the opening control to the fields and the submit button. A form across the screen from its button is a flow problem.
  - Check the same kind of task opens the same way everywhere (dialog, side panel, popover, page). An Add view that is a side panel on one page and a centered dialog on another is a flow problem.
  - Measure on real volume, since an empty fixture hides long lists. Also picture the list at day 1, day 7 and day 30 of use, and with its cap reached.
  - Walk the round trip: from A to B, change something on B, then back to A by the visible back control (not a reload). Does A show the change, and was the way back easy to find?
- **Flow problems, ranked** with the severity scale below. Look for:
  - information needed for one decision spread over sections or pages;
  - actions far from the information that triggers them;
  - order by data type instead of by the user's question;
  - the same number shown twice with different labels, or near-duplicate names;
  - lists with no paging;
  - work the phone layout makes harder (many folds, lost state on reload);
  - a dialog where an inline control would do.
- **Every control, one by one:** is it as loud as it is important? A utility action that repeats across pages (copy, open, edit a row) is one shared small control: an icon button with a tooltip and an accessible name, not a full text button per instance. Look for a component that already does it, and fix it once in the shared component so every page gets it.
- **The quick check**, one line each:
  - Can I tell what page this is and where I am?
  - Is the main action obvious?
  - Does it show what is happening (loading, saved, failed)?
  - Do error messages say what to do?
  - Can I cancel, undo or go back, and does Back work?
  - Does it work without hover, and are all controls labeled?
  - Does anything make me stop and think "huh?"
- **A proposed direction** with each task's step count after the change.

Show the audit and the direction and wait for an answer before a restructure. Small fixes inside the existing layout can go ahead.

Severity: 0 not a problem, 1 cosmetic, 2 minor (delay or frustration), 3 major (task fails or needs another page), 4 catastrophic (task blocked). Weigh how often it happens, how bad it is, and whether it repeats. When two rules conflict (fast versus safe), decide by how easy the action is to undo and how often it happens: Undo over a confirm for a frequent, reversible action.

## 3. Build every state, with the platform first

List the states for the feature before you build, then build each one:

| State | What the user must see |
|-------|------------------------|
| Loading | A placeholder or "Loading…" with `aria-busy` or `role="status"`; no layout jump when data arrives |
| Empty | A sentence that says why it is empty and what to do ("No members match "zz". Clear the search.") |
| Error | What failed, in plain words, and a way out (Retry, or a link). Never a blank area or a console-only error |
| Done | Confirmation that the action happened, announced to screen readers |
| Pending action | The control shows progress and is disabled only while the request runs; a double press sends once |
| Long and odd content | Very long names, ids and words wrap or truncate with the full value reachable; 0, 1 and 500 items all look right |
| Partial failure | One row's action failing does not break the rest of the list |

Every control has its hover, focus, disabled, loading and error looks, and each has a rule in the shared CSS. Look for a way the project lets you force failures (a mock flag, a fixture, a dev toggle) so you can see the error state yourself.

Semantic HTML gives keyboard support, focus and screen-reader names for free. Reach for ARIA only when no element does the job:

- `<button>` for actions, `<a href>` or the router's link for navigation. Never a `<div>` with a click handler.
- Every input has a visible `<label>` (at least `aria-label`), the right `type`, `name` and `autocomplete`. Inputs that submit live in a `<form>`, so Enter works.
- Icon-only buttons have an accessible name that says what and which ("Remove Ada Lovelace", not "Delete" twelve times); the icon gets `aria-hidden="true"`.
- One `<h1>` per page, headings in order, lists as lists, tables as `<table>` with `<th scope>`.
- Async results go in an `aria-live="polite"` region or `role="status"`; blocking errors in `role="alert"`.
- Visible focus on everything interactive (`:focus-visible`). Dialogs move focus in, trap it, return it to the trigger and close on Escape. After a removal, move focus to the next row or the list heading.
- Errors sit under their field, say how to fix it and keep what was typed. A destructive action has Undo or a confirm.

Layout that survives real content:

- Design at 360 px wide first, then widen. The page never scrolls sideways.
- Flex children that hold text need `min-inline-size: 0`; nothing in a stacked table keeps `nowrap`. User text uses `overflow-wrap: anywhere`, or a deliberate truncate with the full value reachable.
- A sticky footer or header does not cover the focused field. On a touch screen, do not focus a text field at open or after a chip fills it, since the keyboard covers the next step. Sheets and dialogs have `overscroll-behavior: contain`.
- Touch targets at least 24×24 CSS px, 44 px for primary phone actions. Respect `prefers-reduced-motion`; never `transition: all`.
- Keep state the user expects to share or reload (search, tab, page, filters) in the URL. Derive values during render instead of copying state into other state.

The full review checklist (forms, motion, typography, images, touch, theming, locale, hydration) is in `references/ui-checklist.md`. Use it when reviewing UI code.

## 4. Sweep each defect

Every defect found, by the audit, a test, the checker or the user, gets a sweep before it is called fixed:

1. State the defect class in one sentence ("a `white-space: nowrap` rule beats the phone rule that lets table cells wrap").
2. Search for it across every screen and the shared CSS and components.
3. Sort each hit: same bug (fix), similar risk (look at it), false positive.
4. Fix it once in the shared code, and add a test that checks the class, not only the one screen (for example, add the page to the phone width test).
5. When the class is new, add one line to the project's UI lessons file, refining an existing line rather than adding a near-duplicate. Create the file the first time, and add a one-line pointer to it in CLAUDE.md. A line must change what the next pass does; a platitude does not. Do not write lessons into this skill's own folder, since a plugin update replaces it.

## 5. Check it in a browser yourself

Run the project's `typecheck`, `lint` and `test`, then `build`, and read the output. Then open the page.

**The checker.** `scripts/check_ui.mjs`, next to this file, loads one page in Chromium and prints a JSON report:
- It saves full-page screenshots at each width.
- It reports console errors, sideways page overflow, and elements whose content is wider than their box.
- It reports controls without a name, controls that share one name, inputs without a label, images without alt or size, and clickable elements that are not buttons or links.
- It walks the page with Tab and lists each stop without visible focus.
- It adds axe-core's WCAG 2.2 AA results when the project has axe-core.

Run it from the project folder, so it finds the project's Playwright, against your own dev or preview server only:

```bash
node <this skill's folder>/scripts/check_ui.mjs "http://localhost:5173/settings" --out .ui-check --schemes light,dark
```

- The default widths are 360, 1366 and 1920. Add a width at the narrow end of each layout breakpoint (`--widths 360,1366,1536,1920`), where columns hit their minimums.
- A page behind a sign-in needs a saved session. Sign in once with `npx playwright codegen --save-storage=.ui-check/auth.json <url>`, or save `page.context().storageState()` from the project's browser test setup. Then pass `--storage-state .ui-check/auth.json`. Check `finalUrl` in the report: if it is the sign-in page, the session did not take. Keep `.ui-check/` out of git.
- A page that keeps a stream or a poll open never goes network-idle, so the checker waits for `load` plus `--wait` ms. Raise `--wait` when data arrives late.
- If Playwright is not installed, the checker exits 2. Say so; do not skip silently.
- For a live page in the user's own signed-in browser, use a real-browser skill or browser tool when one is installed.

**Then look yourself:**
- Read the screenshots; do not just confirm they exist.
- Crop matching regions of the mockup and the build at 1:1 and compare each pair. One downscaled full-page image hides spacing, dividers and shading. Report the differences as findings; do not hand the comparison to the user.
- Check light and dark themes, desktop and phone.
- Use real content at its extremes: the longest names with tags, long ids and URLs, a long single word in every user-typed text cell (notes, reasons, chat), a 50-row list, the empty state.
- Force the unhappy paths: the error state, a search for nothing, removing the last item, an invalid value, the keyboard only.
- Recount each audited task's steps on the build.

If you cannot run a browser here, say exactly what you could not check. "It builds" is not "it works". Delete the screenshots when done.

## 6. Report

End with:
- What you built, and which existing components and tokens you reused.
- The states you handled.
- What you checked and how: commands run, checker findings, screenshots looked at, each task's steps before and after.
- What you could not check, and follow-ups you deliberately left out.

## Known defect classes

Each line is a class found in real passes. The project's own lessons file adds its specific ones.

- Differences from the mockup (a header bar not full width, missing dividers, unshaded rows, an outline only on hover) survived until the user saw them. Compare at 1:1, in both themes. For each shaded relationship in a one-theme mockup, check its direction (darker or lighter than its neighbor) in the other theme too, since a shared surface color can be darker than a panel in light and lighter in dark.
- An actions cell with `white-space: nowrap` beat the stacked-table wrap rule (same specificity, later in the file), so buttons ran off the phone screen in every table; the empty test fixture hid it. One fix in the shared CSS reached them all.
- Every disabled button looked ready to press, because the shared `button` colors replaced the browser's gray and no `:disabled` rule existed. Plain `<summary>` toggles kept the default cursor and had no hover. When a pass adds a state, look at it in a screenshot, and check that each control state has a rule in the shared CSS.
- A search box with only a placeholder kept the browser's default width, so at 360 px its placeholder was cut and its button wrapped. A style scoped to `form.bar` also missed the same bar built as a `div` in a dialog. Read each placeholder in full on the phone screenshot, and scope shared layout classes by class, not by element.
- A long display name widened pages past a phone screen, because `white-space: pre` (kept to show repeated spaces) never wraps; the fixture names were short. Use `pre-wrap` with `overflow-wrap: anywhere` for user text. At desktop width a single long word in a note held a table column wide and pushed the page sideways: `break-word` does not shrink a table column, only `anywhere` does.
- Sibling cards put a count beside the name with a flex wrap, so a long name pushed the count below on one card and not on the others. Sibling items (cards, rows, tiles) place each part at the same spot whatever the content length: a fixed layout, not one a wrap decides. Check with a different name length on each sibling, and assert the positions in the browser test.
- A dialog that treats every submit inside it as a save locked up when a GET search form sat inside it. Search inside a dialog navigates from a button (in SvelteKit, `goto(url, { keepFocus: true, noScroll: true })`) instead of submitting a form.

## Sources

- The severity scale and quick check are adapted from wondelai's ux-heuristics (github.com/wondelai/skills, MIT), after Krug and Nielsen.
- The task walk, round trip and seasoned data come from jezweb's ux-audit (github.com/jezweb/claude-skills).
- The phone and dialog rules come from vercel-labs web-interface-guidelines, pbakaus impeccable and owl-listener designer-skills.
- The sweep comes from drewdrewthis claude-skills sweep and bostonaholic skills learning-from-mistakes.
- These come from claude-code-templates' senior-frontend skill (commit 7ae495d, MIT): the read-first step, the states table, the platform rules, the checker scripts, the review checklist and the report. See `references/NOTICE.md`.
