---
'@barefootjs/blade': patch
---

A Blade reserved name (`loop`, `bf`, `this`, `app`, …) no longer collides with its `_`-suffixed twin (#3408). Reserved names now map to the compiler-internal `__bf_<name>` in both the emitted template and the runtime's `blade_ident`, so `props.loop` and `props.loop_` keep their own values. A component that also uses the internal spelling (`loop` with `__bf_loop`) is refused with BF105, as on Jinja, MiniJinja, Twig and Pebble.
