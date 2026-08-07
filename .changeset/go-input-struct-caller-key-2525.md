---
"@barefootjs/go-template": patch
---

Go adapter's Input struct now keys an aliased destructured prop by its caller-facing name (#2525)

`function Badge({ n: count }: { n: number })` used to name the generated
`BadgeInput` struct field from the LOCAL destructure binding
(`capitalizeFieldName(param.name)` → `Count`), so a caller-side composite
literal keyed by the real prop name (`BadgeInput{N: 5}`) failed `go run`
outright (`unknown field N in struct literal of type BadgeInput`) — the
Go-specific residual of #2460 tracked by #2525 (`aliased-destructured-prop`
render-divergence pin, now graduated).

The Input/Props split is now:

- `BadgeInput.<field>` (what a caller writes) is keyed CALLER-facing —
  `capitalizeFieldName(sourceName ?? name)`, so it's `N`.
- `BadgeProps.<field>` (what `{{.X}}` in the template executes against)
  stays keyed LOCAL — `capitalizeFieldName(name)`, so it's `Count`, unchanged.
- **`BadgeProps`'s json tag flips to the caller-facing key** — `json:"n"`
  instead of `json:"count"`. This is a **wire-format change**: the
  hydration payload (`bf-p`) key for an aliased prop is now `n`, matching
  the shared client JS (`@barefootjs/jsx`/`@barefootjs/client`, #2524) which
  already reads `_p.n`. Before this fix the two were already mismatched in
  the OTHER direction (Go emitted `json:"count"` while the client read
  `_p.n`) — hydration for an aliased prop was already broken on Go; this
  change makes the two sides agree instead of introducing a new mismatch.
- `NewBadgeProps` bridges the two: `Count: in.N`.
- The `bf.RegisterReprops` rebuilder (`#2448`, per-row composite-loop
  overrides) carries both fields again — the case label matches the parent's
  `bf_with_props`/`bf_reprops` call (Props field, unchanged), the assignment
  target is the Input field (now caller-facing). 437f822 (#2457) had
  collapsed this to one shared name when Input and Props were always
  identical; it's split again now that they aren't for an aliased prop.

Every other constructor-context Go emission that reads `in.<Field>` off a
possibly-aliased prop (memo/signal initial values, spread-bag lowering,
`Record`-index lookups, derived-const folding) was audited and updated to
resolve the caller-facing Input field — an un-aliased prop is unaffected
(identity). The `props.<X>` member-access sites in the source-expression walk
(e.g. `collectPropsReadByCtorInit`) were audited too and correctly **left
alone**: they read the LOCAL destructure binding straight off the TSX source,
which #2525 never touches — only the constructed Input struct's own field
naming changed.

Graduates the `aliased-destructured-prop` render-divergence pin for
`go-template` — the fixture now renders on real Go and matches the Hono
reference.
