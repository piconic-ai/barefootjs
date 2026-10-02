---
"@barefootjs/pebble": patch
---

A root or child prop/signal whose name is a Pebble/Java reserved word (`filter`, `class`, …) now renders in SSR. The compiled template reads it as `filter_`, but the Java runtime's `DeriveStashFromDefaults.derive` keyed it as `filter`, so it rendered empty until hydration. `derive` now returns the template's (mangled) names. A new `DeriveStashFromDefaults.rootVars(defaults, props, overlays…)` builds a root render's context from source-named props and stash, and `PebbleIdent` is public. Host applications building a root context should use `rootVars` (as `integrations/spring`'s `Render` now does).
