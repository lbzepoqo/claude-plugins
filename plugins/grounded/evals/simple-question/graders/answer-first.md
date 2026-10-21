---
type: llm
---

PASS if the first sentence says no (it does not raise) and the reply says it returns None or the given default.
FAIL if the first sentence does not answer the question, or the reply says it raises KeyError.
