---
"@barefootjs/cli": patch
---

Touch `uno.config.ts` after `bf add` writes new component files so a running `unocss --watch` re-scans its globs and generates styles for newly-created component directories.
