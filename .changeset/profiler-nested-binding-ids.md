---
"@barefootjs/jsx": minor
---

Attribute deeply-nested loop binding effects in the profiler (#1690, closes #1795).

Phases 1–2 attributed top-level, conditional-branch, and direct loop-child
binding effects. Phase 3 closes the remaining nested emit paths so every binding
effect a loop produces carries a `<Component>#binding:<slotId>` id and every
emitted id resolves via `buildIdIndex` — `bf debug profile` now reports zero
coverage gap for nested list/conditional structures:

- **analyzer** (`collectDomBindings`) — loop-param awareness now extends to the
  `conditional` case (`origin.freeRefs`) and the inner-`loop` case
  (`arrayFreeIdentifiers`), so a loop-child conditional (`{r.on ? …}`) and an
  inner loop reading the outer param (`{r.tags.map(…)}`) register as reactive
  `domBindings` with slot + loc.
- **emit** — `profileComponentName` is threaded through the remaining loop
  stringifiers, each emitting the id via a shared `profileBindingId` helper:
  loop-child conditional `insert()` + branch text (`reactive-effects` /
  `loop-child-arm`), inner / nested loop `mapArray` + child text/attr
  (`inner-loop`), branch-scoped loop `mapArray` (`branch-loop`), static-array
  loop child effects (`loop`), composite and component loop `mapArray`
  (`composite-loop` / `component-loop`).

Off by default the emitted effects are byte-for-byte unchanged (SR8). The one
remaining residual is a child component's reactive *children* text inside a
component loop (`<Row>{it.label}</Row>`), which is a component-children binding
rather than a DOM binding and is not yet resolved by the analyzer.
