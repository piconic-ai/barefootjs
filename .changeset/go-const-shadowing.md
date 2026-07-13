---
"@barefootjs/go-template": patch
---

Fix #2236: two independent Go template adapter gaps in loop-param-shadowing
resolution, both previously flagged as "not fixed" tracked residuals in the
#2221/#2212 changesets.

Slice A: `convertExpressionToGo`'s bare-identifier fast path (the
"inline a function-scope literal const" shortcut, e.g. `totalPages`) is a
string-keyed check over the raw JS source text, reached directly by call
sites like attribute emission (`key={count}` → `data-key`) that never go
through `identifier()` — the `ParsedExprEmitter` method that already carries
loop-shadow guards (`loopParamStack` / `isOuterLoopParam`, mirrored from
`resolveModuleStringConst` / `resolveModuleNumericConst`). A `.map((count) =>
...)` callback param shadowing an outer `const count = 7` got the OUTER
literal inlined at the `data-key` position even though the text position
(which does go through `identifier()`) correctly resolved to the per-item
value. Guarded with the same loop-shadow checks the sibling resolvers use;
unlike the Twig-family's coarse `collectLoopBoundNames` trade-off, Go's guard
is scope-precise (it consults the live `loopParamStack`), so a const whose
name is loop-bound elsewhere in the component still inlines correctly at a
genuinely non-shadowed occurrence outside any loop.

Slice B: Go's own `collectStringValueNames` (`prop-classes.ts`) was ported
from Blade before #2212 added the `collectLoopBoundNames` exclusion, so it
lacked the loop-bound-name subtraction every other adapter's prop-classes.ts
has. An outer string-typed prop/signal shadowed by a `.map()` callback param
of the same name still poisoned the shadowed occurrence's type resolution —
`1 + label` inside `values.map((label) => ...)` (with an outer `label:
string` prop) emitted `bf_concat_str` (string concat, "1" + "1" → "11")
instead of `bf_add` (numeric addition, 1 + 1 → 2). Fixed by porting the full
#2212 shape the sibling adapters carry: same-file local consts join the
string set (so an outer `{label + suffix}` with `suffix = '!'` still
classifies as concat via its other operand once `label` is subtracted) and
loop-bound names are excluded via `collectLoopBoundNames`. The exclusion is
the accepted #2212 coarse trade-off (a flat, component-wide name set), not
scope-precise like slice A: a genuinely non-shadowed occurrence outside the
loop, whose name happens to be loop-bound elsewhere, also falls back to
numeric `bf_add`. Safe (never silently-wrong string output), just imprecise.

With both fixed, the shared `loop-param-shadows-outer-name` conformance
fixture (#2212/#2221/#2222) now renders at reference parity on Go — its
`render-divergences.ts` entry is removed.
