---
'@barefootjs/cli': minor
---

Go runtime: `bf.Renderer.Render` now backfills a unique `ScopeID` for
child components (slice and single) whose `ScopeID` was left empty,
deriving the `<Component>_<random>` prefix from the props type. This
lets application handlers build child props without minting scope ids by
hand (e.g. `TodoItemProps{Todo: t}` instead of
`TodoItemProps{ScopeID: ..., Todo: t}`). Explicit `ScopeID` values are
preserved. Shipped with the vendored runtime in `bf init` scaffolds.
