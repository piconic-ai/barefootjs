---
"@barefootjs/jsx": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

`planLoop` in `@barefootjs/jsx` now plans a `.filter().map()` loop's filter. It renames the predicate's shadowed captures to their aliases, and its param to the loop param. It refuses a filter whose predicate never reached the IR. The new `spellFilteredRow` puts a loop row inside the filter's guard. The eight DSL template adapters now render the filter through these two functions instead of each keeping its own copy. They emit the same templates and diagnostics as before.
