---
"@barefootjs/cli": patch
---

`bf gen component --help` (and `-h`) now prints usage and exits 0 instead of crashing with a `TypeError` in the name conversion. Unknown flags and component names that are not lowercase kebab-case now get a clear diagnostic.
