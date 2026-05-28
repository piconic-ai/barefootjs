---
"@barefootjs/cli": patch
---

Improve `bf gen preview` output quality: wrap multi-root previews in a Fragment (`<>…</>`), resolve `XxxIcon` tags to `../icon`, import sub-components that share the parent's name prefix (e.g. `TypographyH1`) from the parent module instead of a guessed path, merge same-module imports onto one line, and include digits in the tag-name regex so names like `TypographyH1` aren't truncated.
