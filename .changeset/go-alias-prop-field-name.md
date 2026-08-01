---
"@barefootjs/go-template": patch
---

Fix a per-row prop override silently dropped for an aliased destructured child prop (#2457)

A child nested inside a COMPOSITE dynamic loop row (`<li><Badge .../></li>`)
whose props use an ALIASED destructure had its per-row override discarded
with no diagnostic:

```tsx
function Badge({ text, n: count }: { text: string; n: number }) {
  return <span class="badge">{text}:{count}</span>
}
// <li key={row.id}><Badge text={row.label} n={row.n} /></li>
```

`generateInputStruct` / `emitPropsDataFields` name a child's Go field from
its LOCAL binding — `n: count` becomes the struct field `Count`, not `N`.
`loopRowChildPropOverrides` (the per-row override emitter) capitalized the
JSX attribute name instead:

```gotemplate
{{template "Badge" (bf_with_props $.BadgeSlot0 "Text" .Label "N" .N)}}
```

`bf.WithProps` documents an unknown-field pair as a deliberate passthrough
(`bf_with_props` patches named fields on an already-constructed instance),
so `"N" .N` was silently dropped and `Count` kept the shared instance's
constructor-time value (row 0's `n`) on every row.

The fix resolves the child's own Go field name ONCE, at the parent's
emission site — the only place that has both the JSX attribute name and the
child's shape — instead of leaving the mismatch for the runtime helper to
paper over:

```gotemplate
{{template "Badge" (bf_with_props $.BadgeSlot0 "Text" .Label "Count" .N)}}
```

A new `childPropFieldNames` map (JSX attribute name → child's own Go field
name) is populated from the same two doors `childDerivedFieldDeps` already
uses — `registerChildComponentShape` (the CLI's cross-file pre-pass) and
`generate()`'s self-registration — so a same-file loop-row child (the only
kind this bug reaches) always has an entry by the time
`loopRowChildPropOverrides` looks.

This also simplifies the `#2448` props-rebuilder (`bf_reprops`): its
generated `switch` used to be keyed by the PARENT's name on the case label
and the CHILD's field on the assignment target, reconciling the two sides
right there. Now that the parent already emits the child's own field name,
the switch is keyed by that one name on both sides — one place to get the
naming right instead of two.

For an un-aliased prop the JSX attribute name and the child's field name are
the same string, so `childPropFieldNames` is an identity map and every
currently-passing fixture's emitted template stays byte-identical.

Verified end-to-end against the real Go runtime (`renderGoTemplateComponent`)
for both an aliased child with no derived field and one with a `createMemo`
depending on the aliased prop (the `#2448` rebuild path) — both now show the
correct value on every row.

No conformance fixture yet, and the reason is worth recording: building one
surfaced the mirror-image bug in the REFERENCE adapter. Hono emits an aliased
destructure as `{ text, count }` — the local binding used as the property key —
against a props type that has `n`, so any aliased destructured prop reads as
`undefined` there, independent of loops, `'use client'`, or this bug. Fixtures
generate their `expectedHtml` from Hono, so a fixture for this shape would bake
in the wrong reference value and measure every other adapter against it. Filed
as #2460; the fixture lands with that fix.
