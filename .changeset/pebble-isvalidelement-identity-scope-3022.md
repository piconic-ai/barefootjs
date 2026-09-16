---
"@barefootjs/pebble": patch
---

Refuse a bare-name call to an unresolvable module-scope helper with `BF101` instead of silently resolving it against Pebble's template scope (undefined → empty render, or falsy in a boolean-test position — silently picking the wrong branch). Ports #3011/#3012's fix shape from the eight sibling non-JS adapters, which Pebble never received since it was developed on a separate stacked branch that didn't exist on `main` when those PRs landed. `isValidElement(x)` (the one caller that legitimately needs to keep compiling — `ui/components/ui/slot`'s `asChild` guard) is resolved as an identity-scoped `templatePrimitive` (`bf.is_element`, backed by a new `Bf#is_element` Java port of the shared BarefootJS runtime's shape-check method) ahead of the generic refusal, so it never reaches it.
