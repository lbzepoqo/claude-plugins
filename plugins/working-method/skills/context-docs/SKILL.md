---
name: context-docs
description: How to write and audit CLAUDE.md, AGENTS.md and other context docs (map, not mirror), and what belongs in CLAUDE.md versus a skill. Use before adding to or editing any CLAUDE.md or project context doc, and when auditing one.
---

# Maintaining CLAUDE.md and context docs: map, not mirror

CLAUDE.md is a **map, not a mirror** of the code. Its job is orientation, not reproduction.
- **Include** what you can't cheaply derive from the code: business "why", non-obvious conventions, cross-script patterns, gotchas/traps, real bugs, and "where to look".
- **Exclude** anything `ls`/grep/LSP gives you in seconds: full directory trees, exhaustive field/property/class inventories, line-level specifics. These drift every refactor, and stale "mirror" content is *worse* than none because it gets trusted instead of verified, which lays tripwires for the next session.
- For drift-prone facts, write a **pointer** ("see class X for field layout", "grep `getProperty` for the set"), not a snapshot.
- Treat CLAUDE.md as orientation; **the code is ground truth**. Verify against it before asserting, and never answer from the summary alone.
- When editing/auditing a context doc, actively *cut* mirror-bloat; don't just add.
- **A rule for one situation goes in a skill, not in CLAUDE.md.** CLAUDE.md is loaded on every request; a skill costs only its description until it is used. Before adding a section to a CLAUDE.md, ask whether it applies to most tasks. If it applies only to one tool, repo or kind of task, write it as a skill whose description names that situation. When auditing, move such sections out.
  - Exception: a rule whose trigger can come up in any task stays in CLAUDE.md, even when its topic is narrow. A skill loads only when its description matches the task, so a rule like "add each new internal name to the secret scanner's list as soon as it comes up" would be missed when such a name appears mid-conversation.
  - Why: in one measured setup, moving 6 situational sections (9.0 KB) out of a global CLAUDE.md into skills cut a median of 7.0% of the tokens per request (5 runs each, same answers, same turn count). A section that shapes the default behavior on every task stayed.
