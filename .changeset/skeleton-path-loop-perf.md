---
"@barefootjs/jsx": patch
"@barefootjs/client": patch
---

Perf: hoisted single-root `mapArray` loop bodies (#2143 gap 1) now resolve reactive attr/text/ref slots on a fresh clone via compile-time child-index paths (`.firstChild.nextSibling...`, Solid-style) instead of a per-row `qsa()`/`$t()` runtime lookup, computed from the loop's existing skeleton IR and bailing to the runtime lookup for any loop shape the HTML parser could restructure (tables, `<select>`, `<p>` auto-close, `<pre>`/`<template>`, cross-tag auto-close groups, or content a bare `<tr>` would foster-parent out of the row) or for hydration. `@barefootjs/client` exports the existing text-marker helper as `tAfter` for this codegen to call.
