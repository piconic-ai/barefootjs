---
"@barefootjs/cli": patch
---

fix(profile): never truncate `hotSubscribers` in `--json` mode (#1849 B1)

`--top N` is a display cap on the dynamic hot-subscribers table; `--json` is documented as never truncated. The profile command now skips the slice in JSON mode so the serialized subscriber list is complete.
