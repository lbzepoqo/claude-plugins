---
name: ui-design-start
description: How to design a screen, panel, popup or dialog before writing its code. Start from the user's question, try two or three structures, mock them up in HTML with real data sizes on desktop and phone, and pick one with the user. Use before building or reworking any UI, before a ticket that adds a screen, and before ui-ux-pass checks the result.
---

# Design a screen before building it

ui-ux-pass builds and checks the screen. This skill comes first, before any component code. Read the project's UI lessons file first (the path its CLAUDE.md names for UI lessons, else `docs/ui-lessons.md`), then "Known defect classes" at the end.

## 1. The question the screen answers

Write five lines in the plan or audit file:

- **Who and where:** who opens it, on which device, in the middle of what (an operator on a live view, on a phone).
- **The question:** the one thing they want to know when they open it ("is this person here, and are they a problem?").
- **The next action:** what they do once they know.
- **What decides it:** the 3 to 5 facts that answer the question, most deciding first.
- **What can wait:** everything else, one tap away (the full page, the full history).

Order the screen by these lines, not by the data model. A trimmed copy of another page (its fields, its table, its button row) answers that page's question, not this one. Check each block against the question: keep it, move it lower, or link to it.

## 2. Two or three structures, not one

The first layout that comes to mind is the most familiar one. Sketch two or three that differ in a product decision:

- where the main action sits (top, beside the facts, sticky footer);
- grouping and order;
- density (table, list, sentence rows);
- the container: inline, a popover at the control, a dialog, a side panel or a sheet.
  - Open it where the pointer already is: inline, or anchored to the button that opened it, before the app's usual dialog.
  - Use a side panel only when the user must read the page beside the form while filling it in. On a wide screen it sends the pointer across the whole screen and back.
  - Use the container the rest of the app uses for the same kind of task, so each page does not invent its own;
- pointer travel: for the main task, trace the pointer from the opening control to each field and the submit button, at 1920 wide. Put the fields and submit near the opening control, in reading order;
- how it reflows from desktop to phone.

Give each a name and one line on its trade. Changing only colors or spacing does not make a separate structure.

Layout patterns and when each fails:

- Single column: focused tasks. Fails when the user compares.
- Sidebar plus content: filters or navigation beside work. Fails below tablet width.
- Master-detail: list beside the selected item. Fails when the detail needs the full screen.
- Table: comparing on attributes. Fails on a phone unless rows stack with labels.
- Sentence rows (activity feeds): reading events in order. Fail when the time and type columns do not line up.

## 3. Mock it up at real sizes

Build a self-contained HTML file per structure, using the project's own CSS tokens and components where they exist, so the result looks like the product (no separate wireframe style).

- Real content at its extremes: the longest ids the product shows (32 characters and more), the longest names with tags, a 50-row list, the empty state, a long note.
- Every width band: a 1920 desktop, a 1366 and a 1536 laptop (with the sidebar), and a 360 phone. Check each breakpoint's band at its narrow end, where columns hit their minimums. Both themes when the product has two.
- Screenshot every width and look at them at 1:1 before showing them. Run ui-ux-pass's checker on the file (serve it locally) for overflow and unnamed controls.
- Every control with its states: hover, focus, disabled, loading, error.
- Send the HTML file itself to the user, with the names and trades, and say which window width shows the phone layout. Attach it, or publish it as a page they can open. The screenshots are your own check and at most a preview beside the file, never in place of it, because the user wants to resize and click it. Wait for their pick before the build. When the user already chose a structure, mock that one only and still check it at every width.

## 4. Hand over to the build

Write the chosen structure into the plan or ticket: the question, the order of blocks, the container, the phone reflow and the extremes to test. The browser tests then check those extremes, and ui-ux-pass compares the build with the mockup.

## Known defect classes

- A popup built as a trimmed copy of a full page had no status, put its actions at the bottom, and let a long id run over the id beside it on desktop and phone. Starting from the question would have put the status and actions first. A mockup with a real 32-character id at both widths would have shown the overlap.
- A mockup was built in HTML but only its screenshots were sent, so the user never resized or clicked it. Once they had the HTML file itself, they said it beat the images.
- A mockup checked only at 1920 and 2560 kept its side column at its minimum width from 1366 to 1800, so rows took two or three lines beside cramped content. The user saw it only after the deploy. Check every band at its narrow end.
- A skill line that said "try a side panel first" sent the pointer from a card at the left edge to a form at the right edge of a wide screen and back, while a similar popup elsewhere opened in the middle. Anchor the form to its control, and match the container used for the same task elsewhere.

## Sources

The review question and the two or three structures that differ in a product decision are from plannotator/effective-html html-wireframe (commit 5ce160a). The layout patterns and when each fails, and "the obvious structure mirrors the org chart instead of the user's task", are from ghaida/intent wireframe (commit 1806110). "Modal as first thought" is from pbakaus/impeccable operate.md.
