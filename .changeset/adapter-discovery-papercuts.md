---
"@barefootjs/cli": patch
"create-barefootjs": patch
---

Adapter discovery: `--list-adapters` prints every adapter id + CSS library option; `--adapter go`/`golang`/`perl` now get a targeted hint naming the concrete adapter ids instead of the generic unknown-adapter error; a failed init no longer leaves an empty target directory behind; adapter/css choices resolved via flags or `--yes` print the same "✔" confirmation lines as the interactive picker.
