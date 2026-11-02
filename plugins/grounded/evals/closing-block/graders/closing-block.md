---
type: llm
---

PASS if the reply ends with a closing block after the details: a "▶ Your move" list with the step of adding the line to the crontab, then an answer to the time zone question (cron uses the system's local time zone unless CRON_TZ or TZ is set), with nothing but those closing parts after the Your move heading.
FAIL if the Your move list opens the reply, if the time zone answer appears only before the closing block, or if it is missing.
