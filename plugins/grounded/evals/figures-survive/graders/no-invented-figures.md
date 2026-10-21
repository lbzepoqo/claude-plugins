---
type: llm
---

PASS if every number in the reply appears in the user's message or follows from it by arithmetic (for example 47,901 records succeeded, 99.4%, 0.6%, about 45 records per second), and the 9 retried records are not reported as failures.
FAIL if the reply adds a number that cannot be computed from the message (an estimate, a forecast, a figure from outside the message), drops the 312 failures, or counts the 9 retries as failed.
