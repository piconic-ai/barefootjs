---
'@barefootjs/jinja': patch
'@barefootjs/rust': patch
'@barefootjs/twig': patch
'@barefootjs/pebble': patch
'@barefootjs/blade': patch
'@barefootjs/jsx': patch
---

A JS binding named `loop` no longer collides with the engine's own loop variable inside `{% for %}` (#3404). Jinja, MiniJinja, Twig and Pebble now map it to the compiler-internal `__bf_loop`, in both the emitted template and the runtime's prop-name mangling. A real `loop_` stays distinct.

A `.filter()` param is now renamed to the `.map()` row item on the parsed predicate instead of the rendered text, on Jinja, MiniJinja, Twig, Pebble and Blade. A param named `loop` now tests each row, and a string literal spelled like the renamed name stays as written.

New diagnostic BF105: those four adapters refuse a component in which two distinct names visible at the same point would become one template variable (for example `loop` and `__bf_loop`), instead of rendering both with one value.
