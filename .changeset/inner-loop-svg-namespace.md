---
"@barefootjs/jsx": patch
---

Fix #2219: an inner reactive `.map()` whose item root is an SVG element (`<line>`, `<circle>`, ...) no longer renders invisibly. `template.innerHTML` always parses in the HTML namespace, so a bare SVG-rooted item cloned as an `HTMLUnknownElement` — present in the DOM, but never drawn by the SVG renderer, with no error.

The fix wraps SVG-rooted item templates in a synthetic `<svg>` and descends one extra level (`.firstElementChild.firstElementChild`) before cloning — the same `templateRootIsSvg` idiom the top-level (#135/#1088) and branch-arm paths already used, now applied to the inner-loop reactive clone (`stringify/inner-loop.ts`, the issue's root cause). While auditing sibling clone sites for the same bug class, the static-loop CSR-materialize single-root and multi-root clones (`stringify/loop.ts`, the #1247 path) turned out to have the identical gap and are fixed alongside it.

HTML-rooted templates keep byte-for-byte identical output; only SVG-rooted item templates — previously broken and invisible — change.
