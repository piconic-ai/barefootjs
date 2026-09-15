---
"@barefootjs/blade": patch
---

Resolve `isValidElement(x)` as an identity-scoped `templatePrimitive` (`$bf->is_element`, backed by the `BarefootJS::is_element` method the Twig adapter's #3012 PR added to the shared PHP runtime, `@barefootjs/php`, which this adapter also backs onto — zero new runtime code needed here) instead of exempting it structurally via a `_boolContext` flag on any call inside a boolean-test position. Previously, ANY bare-name call to an unresolvable module-scope helper — not just `isValidElement` — silently kept the pre-#2994 broken fallback (an unrecognised name resolving against Blade's undefined-variable semantics) when called from inside a condition or ternary test, instead of refusing loudly with `BF101` like the same call in a text position already does. Every other bare-name call now refuses with `BF101` regardless of position.

This is the last of the five adapters #3012 named (ERB, Jinja, minijinja, Twig, Blade); closes #3012.
