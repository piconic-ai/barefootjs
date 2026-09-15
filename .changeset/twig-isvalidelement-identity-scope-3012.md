---
"@barefootjs/php": patch
"@barefootjs/twig": patch
---

Resolve `isValidElement(x)` as an identity-scoped `templatePrimitive` (`bf.is_element`, backed by a new `BarefootJS::is_element` method in the shared PHP runtime, `@barefootjs/php`) instead of exempting it structurally via a `_boolContext` flag on any call inside a boolean-test position. Previously, ANY bare-name call to an unresolvable module-scope helper — not just `isValidElement` — silently kept the pre-#2994 broken fallback (an unrecognised name resolving against Twig's undefined-variable semantics) when called from inside a condition or ternary test, instead of refusing loudly with `BF101` like the same call in a text position already does. Every other bare-name call now refuses with `BF101` regardless of position.

`BarefootJS::is_element` is shared by both the Twig and Blade adapters, so this same runtime addition also satisfies Blade's half of #3012.
