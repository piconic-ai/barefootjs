---
'@barefootjs/twig': patch
'@barefootjs/blade': patch
'@barefootjs/pebble': patch
---

Keep a template-level name intact after a `.map()` loop whose row binds the same name. Twig, Blade and Pebble now save a signal, memo, prop, constant or enclosing row binding that the row's index, destructure binding or preamble local shadows, and restore it after the loop (#3391).
