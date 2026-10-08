---
"@barefootjs/pebble": patch
---

A `.map()` index, destructure or entry param named like a template-level signal, memo, prop or local constant no longer overwrites it for the rest of the template. Pebble's `{% set %}` inside a `for` body is not loop-scoped, so the loop now saves each such name before it runs and restores it afterwards. The param shadows the outer name only inside the row, as in JavaScript.
