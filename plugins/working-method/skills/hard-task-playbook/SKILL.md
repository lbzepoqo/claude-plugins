---
name: hard-task-playbook
description: Working method for hard, multi-step tasks - how to decompose them, how to verify your own output, and how to decide the next move. Load at the start of any task with real unknowns (subtle bugs, multi-file changes, unfamiliar platforms, anything where a wrong-but-plausible answer is expensive).
---

# Hard Task Playbook

The core stance: **treat your own first answer as a hypothesis, not a result.** Plausible-and-wrong is the failure mode that costs the most, because nothing downstream flags it.

## 1. Decomposing a hard task

- **Read before you plan.**
  - A plan written before looking at the actual code, docs, or data is a guess wearing a plan's clothes.
  - Spend the first block of effort only on gathering ground truth: the real file, the real API response, the real error text.
- **Find the load-bearing unknown first.**
  - Every hard task has one or two assumptions that, if wrong, invalidate everything downstream (an API that may not exist, a permission that may not be granted, a data shape that may differ).
  - Sequence the work so the riskiest assumption is tested earliest and cheapest. Do not build three layers on top of an unverified foundation.
- **Split by verifiability, not by file.**
  - A good chunk is one you can prove correct on its own before moving on. "Edit these four files" is not a chunk; "make X observable behavior true, then confirm it" is.
  - If a step has no check, it is not done when the code is written. It is done when the check passes.
- **Separate reversible from irreversible.**
  - Batch reversible steps freely; isolate irreversible ones (deletes, deploys, outward messages) and re-verify the evidence right before each one.
  - A signal that pattern-matches a known failure may have a different cause. Check that the evidence supports the *specific* action, not just the family of action.
- **Parked items and mid-task discoveries become visible tasks immediately, or they are lost.**

## 2. Verifying your own work

- **Evidence before assertions, always.**
  - Never claim "fixed", "passing", or "complete" without having run the thing and looked at the output in this session. "Should work" is not a state.
  - Prefer end-to-end behavior over proxies: drive the real flow, not just the unit test, not just the typecheck.
- **Verify shape, not just value.**
  - Return types, array-ness, string-ness, encoding. Many platform bugs (Java strings in Rhino, lazy caches, session-dependent branches) produce values that *look* right in one context and break in another.
  - If the test environment differs from the runtime environment (sandbox vs UI session, local vs instance, dev vs prod locale), the test proves less than it appears to. Say so, and verify in the real one when the difference could matter.
- **Re-derive, do not inherit.**
  - Existing configs, prior implementations, accepted community answers, and your own earlier conclusions in the same session are all inputs to check, not facts to build on.
  - When a doc or memory conflicts with the code, the code is ground truth.
- **Self-review the diff as a hostile reviewer before committing.**
  - Re-read every changed line asking "what input breaks this" rather than "does this look like what I meant".
  - Scan generated code for the known drift patterns: bare abbreviated names, AI-voice comments, leftover debug output, promises the code does not keep.
- **One counter-experiment beats three confirmations.**
  - When you believe you found the cause, try to make the bug happen *without* your suspected cause, or make it not happen *with* it. Confirmation-only testing feels rigorous and proves little.

## 3. Deciding what to do next

- **After every result, re-ask: does this change the plan?**
  - Most results confirm; some invalidate. When one invalidates, update the decomposition explicitly instead of quietly steering around it. Silent plan drift is how half-finished branches happen.
- **When two explanations fit, run the cheapest experiment that tells them apart.**
  - Do not pick the likelier one and keep building. Discriminate first; it is almost always one command.
- **Distinguish blocked-on-user from blocked-on-effort.**
  - Blocked-on-effort (an error, missing info you can find, a failed approach) means keep going: retry, search, take the other route.
  - Blocked-on-user (a real scope decision, a destructive action, credentials) means stop and ask with concrete marked options, recommended one first.
- **Check your last paragraph before ending a turn.**
  - If it is a plan, a promise, or a list of next steps, that is work you have not done. Do it now.
  - Valid end states are exactly two: verified complete, or blocked on input only the user can provide.
- **Report what happened, not what you hoped.**
  - Failing tests get reported as failing, with output. Skipped steps get named as skipped. Confidence language must match the evidence you actually have.
