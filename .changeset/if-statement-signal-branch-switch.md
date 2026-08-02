---
"@barefootjs/jsx": patch
"@barefootjs/client": patch
---

Fix a reactive `if`/`else` early return silently freezing at its SSR-time branch (#2463)

```tsx
"use client"
export function LoadGate() {
  const [loading, setLoading] = createSignal(true)
  if (loading()) {
    return <button onClick={() => setLoading(false)}>Loading...</button>
  }
  return <p>Ready</p>
}
```

SSR rendered the initial branch correctly, but clicking the button did
nothing — no diagnostics, no console error. The semantically identical
root ternary (`return loading() ? <button/> : <p>Ready</p>`) already
compiled correctly. Two independent defects, both fixed:

**No branch-switch effect.** `collect-elements.ts` had a `conditional:`
visitor for `IRConditional` (the ternary) that pushed branch-switch metadata
onto `ctx.conditionalElements`, but no equivalent `ifStatement:` visitor for
`IRIfStatement` (the statement form) — the walker's default auto-descent
treated both branches as flat content, so no `insert()`-family call was
ever emitted for the condition. `IRIfStatement` also had no
`reactive`/`callsReactiveGetters`/`hasFunctionCalls`/`origin`/`slotId`
fields at all, unlike `IRConditional`, so there was no way to classify its
condition's reactivity in the first place.

Fixed by giving `IRIfStatement` the same reactivity fields `IRConditional`
carries (computed the same way `transformConditional` already does, in
`buildIfStatementChain`) and adding an `ifStatement:` visitor that mirrors
the `conditional:` one, sharing the same `ConditionalElement`-building core
(`buildConditionalMetadataCore`) so there is one metadata shape for both
syntactic forms rather than two that can drift.

An `if`/`else` early return has no synthetic wrapper element the way a root
ternary gets (#968) — each branch's own root element carries `bf-s`
directly, matching existing SSR output byte-for-byte — so the client can't
use a `[bf-c]` marker to find the swap target the way `insert()` does for
every other conditional shape. The new runtime `insertRoot()`
(`@barefootjs/client/runtime`) tracks the mounted root by direct reference
instead, and copies `bf-s`/`bf-h`/`bf-m`/`bf-r`/`data-key` onto the
replacement element on a real branch swap so the component's scope identity
survives it.

Because props are reactive in this framework the same way a root ternary's
`props.xxx` condition already was, a prop-conditioned early return (e.g.
`if (asChild) return <Slot/>; return <button/>`) now gets the same
treatment a semantically identical ternary already had — restoring
reactivity that was silently missing there too.

**CSR template referenced an out-of-scope signal.** `canGenerateStaticTemplate`
had a `conditional` arm that bails out of the module-scope-safe "static
template" builder when the condition calls a signal getter, but its
`if-statement` arm never inspected the condition at all — only recursing
into the branches. A signal-conditioned if-statement passed the static gate
and got routed to the static builder instead of `generateCsrTemplate`,
producing a template referencing the signal getter directly
(`loading()`) — a `ReferenceError` on CSR mount, since `loading` is declared
inside `init`, not in template scope. Fixed by sharing one predicate between
the two arms instead of the `conditional` arm's check going unmirrored.
