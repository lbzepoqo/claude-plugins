---
type: llm
---

PASS if the reply answers the time zone question in the body (cron uses the system's local time zone unless CRON_TZ or TZ is set), has no "Your move", "Answers to your questions" or TL;DR section, and either ends without a closing list or ends with a "Waiting on you" list whose only item is adding the line to the crontab.
FAIL if the time zone answer appears only in a closing list or is missing, if a closing list opens the reply, or if an item appears twice.
