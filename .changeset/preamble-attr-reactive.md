---
"@barefootjs/jsx": patch
---

Make an attribute reading a `.map()` callback preamble local reactive (#2447 follow-up)

```tsx
{rows().map(row => {
  const cls = row.done ? 'done' : 'open'
  return <li key={row.id} class={cls}>{row.label}</li>
})}
```

`class={cls}` froze at its row-construction value. The loop runtimes reuse a
row's DOM node on a same-key item update and re-run only the wired slots, and
this attribute was not one: the reactivity classifier sees a bare local, not a
signal or loop-param read, so the value was interpolated into the row template
instead of bound. Row 1 kept `open` after its item turned `done: true` while
the sibling `{row.label}` text updated normally. The child-position twin of
this (`{stateLabel}`) was fixed as a preamble-patched region in #2389; the
attribute position was left as a declared limitation on #2447.

The fix spans two passes, because the obstacle is in two places:

- **Phase 1 grants the element a slot id.** An attribute is only wirable if
  its element carries a `bf` marker, and that is decided when the element is
  built — before the enclosing loop's preamble exists. The client-JS pass
  cannot grant one after the fact, since the SSR template renders from the
  same IR and would not carry the marker.
- **The client-JS pass wires it** and re-runs the preamble ahead of the write.
  In the eager row effect the preamble re-run moves to the top of the body; it
  previously sat between the attr writes and the region writes, which was
  correct only while regions were its only readers.

**The lazy row graph keeps these rows.** `lazyRowEligibility` used to refuse
any binding that read a preamble local, on the grounds that `applyOuter` could
not prime a dependency the local hides — a fail-safe written while the case
was unreachable. Making it reachable would have pushed the exact row the §9.5
widening was built for (`const cls = selected() === row.id ? …`) back onto the
eager path. So the substitution that refusal stood in for is now real:
`analyzeLazyPreamble` reports the preamble's own free identifiers,
`classifyLazyBinding` runs them through the same rules it applies to a
binding's own names, and `applyItem` / `applyOuter` re-run the preamble only
when a binding they own reads one. A preamble no binding reads is still
emitted in `createRow` alone.

Both dependency shapes are verified against the live DOM: an item-driven
preamble updating through `applyItem`, and an outer-driven one updating
through `applyOuter` with its signal on the prime list — the case that would
silently never subscribe if the substitution named the wrong dependency.

Rows that gain a binding also gain a `bf` marker in SSR output, which shifts
slot numbering for the affected components. The `loop-preamble-attr-value` and
`loop-preamble-chained-filter` fixtures record the new markers; no rendered
content changed.
