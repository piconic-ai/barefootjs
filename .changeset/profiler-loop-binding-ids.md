---
"@barefootjs/jsx": minor
---

Attribute loop-child DOM-binding effects in the profiler (#1690, #1795 Phase 2).

Inside a `{items().map(it => …)}` body the emitter wraps every loop-param read
(`{it.t}`, `class={it.n > 0 ? …}`) in a per-item `createEffect`. In profile
mode each of those loop-child attribute / outer-text effects now carries a
`<Component>#binding:<slotId>` id, so the profiler attributes their re-runs to a
source line instead of bare runtime ids:

- **analyzer** — `collectDomBindings` now threads loop-param context, so a
  binding that reads a loop param (or index) registers as a reactive
  `domBinding` with its slot + loc. Detection uses the analyzer's lexer-resolved
  metadata (`origin.freeRefs` for text, `freeIdentifiers` for attributes), not a
  raw-string scan, so a param name appearing only inside a string literal
  (`i` vs `'i'`) is not mistaken for a read. `key={…}` is skipped (it is the
  loop's keyFn, never an effect). `buildIdIndex` then resolves every loop-child
  text/attribute slot to `<Component>#binding:<slotId>`.
- **emit** — `ReactiveEffectsPlan` carries `profileComponentName`;
  `stringifyReactiveEffects` emits the id on each loop-child attribute and
  outer-text `createEffect`.

Previously loop-child re-runs (often the hottest subscribers in a list view)
surfaced unattributed and inflated the coverage gap. Off by default the emitted
effects are byte-for-byte unchanged (SR8). Loop-child *conditional-branch* texts
remain a follow-up.
