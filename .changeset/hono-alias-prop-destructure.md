---
"@barefootjs/hono": patch
"@barefootjs/jsx": patch
---

Fix the Hono adapter dropping a renamed destructured prop's caller-facing key (#2460)

`function Badge({ text, n: count }: { text: string; n: number })` — the
caller passes `n`, the body reads the local binding `count`. The Hono
adapter built its SSR props destructure keyed by `ParamInfo.name` (the
LOCAL binding) instead of `sourceName ?? name` (the CALLER-facing key —
`ParamInfo.sourceName`'s own documented rule), so the emitted function
read a `count` property the caller never passed:

```tsx
// before (wrong): reads a `count` prop that doesn't exist on the caller's object
export function Badge({ text, count, __instanceId, ... }: BadgePropsWithHydration) { ... }
// after: keeps the rename
export function Badge({ text, n: count, __instanceId, ... }: BadgePropsWithHydration) { ... }
```

`count` was therefore always `undefined`, with zero diagnostics. The fix
emits the plain shorthand when the caller-facing key matches the local
binding (byte-identical output for every existing, un-aliased component)
and a `key: local` rename otherwise — including a destructuring default
(`{ n: count = 7 }` → `n: count = 7`) and a non-identifier caller key
(quoted, e.g. `"data-key": local`). This also fixes the dead `class` →
`className` special case: the only way a `class`-named caller prop can
reach a destructured component is via an explicit alias
(`{ class: className }`, since `class` can never be an un-aliased
binding identifier), which now correctly emits the rename `class:
className` instead of a bare `className`.

`@barefootjs/jsx`'s `extractSsrDefaults` (the template-stash adapters'
SSR-seed extractor) had the mirror-image bug: `propName` — the field the
Perl/PHP/etc. manifest consumer reads the CALLER's props by
(`$props->{propName}`) — was set to the local binding instead of
`sourceName ?? name`, so a renamed prop's SSR seed silently fell back to
`null` instead of the caller's value.

The sibling keyings audited in the same pass (props-to-serialize
filtering, the `__hydrateProps` hydration-blob assembly) were already
consistent — both sides key by the LOCAL binding, matching what the
generated client init function reads (`_p.<localName>`) — so they needed
no change.

Verified end-to-end through Hono (`renderHonoComponent`): aliased with no
default, aliased with a default (both caller-omitted and
caller-overridden), the un-aliased case (byte-identical destructure
text), the `class` rename, and the hydration-serialization path (the
`bf-p` blob carries the correct value under the local key that
`initBadge`'s `const count = _p.count` extraction reads).

Adds the composite-loop-row fixture #2457 (fixed on the Go side, #2462)
was blocked on: an aliased destructured prop on a child component inside
a keyed `.map()` row, with distinct per-row values. Verified passing on
Hono and ERB; expected to pass on Go per #2462's fix (not run here per
this change's scope — Go/CI will confirm). Skipped with a pointer back
to #2460 on Blade, Jinja, Mojolicious, Twig, Xslate, and minijinja/Rust,
which still key the caller-facing lookup by the local binding for a
standalone aliased prop — verified failing on all six before adding the
skip.
