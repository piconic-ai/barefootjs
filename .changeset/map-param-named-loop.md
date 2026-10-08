---
'@barefootjs/jinja': patch
'@barefootjs/rust': patch
'@barefootjs/twig': patch
'@barefootjs/pebble': patch
---

A JS binding named `loop` no longer collides with the engine's own loop variable inside `{% for %}` (#3404). Jinja, MiniJinja, Twig and Pebble now map it to the compiler-internal `__bf_loop`, in both the emitted template and the runtime's prop-name mangling. A real `loop_` stays distinct.
