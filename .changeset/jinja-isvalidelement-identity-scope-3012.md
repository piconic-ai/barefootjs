---
"@barefootjs/jinja": patch
---

Resolve `isValidElement(x)` as an identity-scoped `templatePrimitive` (`bf.is_element`, backed by a new `BarefootJS.is_element` Python port of the shared BarefootJS Perl runtime's method) instead of exempting it structurally via a `_boolContext` flag on any call inside a boolean-test position. Previously, ANY bare-name call to an unresolvable module-scope helper — not just `isValidElement` — silently kept the pre-#2994 broken fallback (an unrecognised name resolving against Jinja's undefined-variable semantics) when called from inside a condition or ternary test, instead of refusing loudly with `BF101` like the same call in a text position already does. Every other bare-name call now refuses with `BF101` regardless of position.
