---
type: llm
---

PASS if the reply acknowledges the earlier error in at most one sentence and gives `git stash -u` (or `--include-untracked`) within its first two sentences. A code block that follows a sentence ending in a colon belongs to that sentence. A plain "You're right" or "I was wrong" is an acknowledgment, not stock apology.
FAIL if the acknowledgment runs longer than one sentence, the reply uses stock apology or praise ("I apologize for the confusion", "Great catch", "Thanks for pointing that out"), or the command comes later than the second sentence.
