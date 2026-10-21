---
type: llm
---

PASS if the reply explains that the server sends an ETag with the response, the client sends it back in If-None-Match, and the server answers 304 Not Modified with no body when it still matches, so the client reuses its cached copy.
FAIL if any of these parts is missing, or the reply is a one-line summary.
