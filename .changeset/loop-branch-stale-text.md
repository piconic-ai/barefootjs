---
"@barefootjs/jsx": patch
---

Fix a keyed `.map()` row whose reactive conditional branch is a bare
expression (e.g. `row.done ? row.label : 'pending'`) never updating the
branch text when the item's value changes without its condition flipping.

Two gates used to conspire to freeze the value forever: `insert()`
(`@barefootjs/client` runtime, unchanged by this fix) correctly no-ops when
its condition is unchanged — branch-internal updates are the effect
system's job, not DOM replacement's — but `summarizeLoopChildBranch`
(`packages/jsx/src/ir-to-client-js/collect-elements.ts`) collected NO
`reactiveTexts` for ANY bare-expression branch, so the effect `insert()`
was relying on was never emitted. The value was baked into the branch's
initial template string once, at row-creation time, and never touched
again.

The skip existed to protect a different, still-real shape: a branch that is
a `CallExpression` which may return a live DOM Node (a hoisted
`renderNode={(n) => <Pill/>}` callback lowered to a component call,
#1211/#1213). Re-invoking such a call inside an *additional* nested effect
calls it again on every unrelated tick, discarding the previous element's
listeners/state. That risk is real, but the skip's own rationale comment
attributed the failure mode to "the loop-child arm's `$t()`-based anchor
lookup" — `$t()` no longer exists; it was one of four content mechanisms
removed by the slot-unification work. The current claim door
(`stringifyLoopChildArm` → `lazySlots(..., kind: 'markup')` → `writeMarkup`,
`packages/client/src/runtime/claim-slots.ts`) clears the claimed range and
splices a Node in by identity, so "a second instance lands beside the
first" cannot happen through it — only the call's non-idempotence still
applies, which is why the skip is narrowed rather than removed.

The fix narrows the skip to `node.hasFunctionCalls` — an AST-computed flag
(`exprHasFunctionCalls`, `packages/jsx/src/jsx-to-ir.ts`) that recursively
walks the whole expression, catching a call nested inside a template
literal or a sub-ternary, not just a top-level one. A property access, an
identifier, a literal, a template literal, string concatenation, or a
nested ternary of those cannot themselves construct a DOM node — only a
JSX literal or a call can, and a JSX-literal branch is never `type:
'expression'` in the first place — so those shapes are now collected.

A companion fix in `transformConditionalBranch` gives a bare
loop-item-reading branch (`row.label`) a `slotId` at all: its `needsSlot`
decision previously considered only `reactive`/`callsReactive`, and a
loop-item read is neither (`render-item` is deliberately excluded from
`REACTIVE_BINDING_KINDS` — per-item reactivity flows through the loop's own
per-item signal accessor). Without a `slotId` there is nothing for the new
effect, or the `<!--bf:sN-->` marker `irToHtmlTemplate` emits for it, to
attach to. The check reads the branch's already-computed `freeRefs` for a
`render-item`-kind reference — no new parse, and no regex re-scan of the
expression text (unlike the sibling `transformConditional`/
`transformLogicalAnd` condition-side `referencesLoopParam` helper, which
token-matches against expression TEXT and can false-match inside an
unrelated string-literal branch).

Because `irToHtmlTemplate` renders both the marked-template SSR output
(Go/ERB/Blade/Jinja/Mojolicious/Rust-minijinja/Twig) and the CSR/hydration
template from the same node, the new marker appears identically in both —
verified by a new adapter conformance fixture
(`loop-item-ternary-bare-branch`) and by running the ERB/Jinja/Mojolicious/
Rust adapters' conformance suites locally. The Hono (JSX-runtime) adapter
renders conditional branches via a separate code path
(`renderNodeRawCtx`/`wrapWithCondMarker` in `hono-adapter.ts`) that does not
emit a per-branch slotId marker at all — this is a pre-existing
characteristic (already true before this fix for a call-bearing branch
like `_p.renderCell(id)`), not something this change introduces or
worsens, and Hono is intentionally excluded from the marker-based
`runAdapterConformanceTests` suite. A Hono-server-rendered (not
client-created) row hitting this exact shape stays stale until its first
condition flip, at which point `insert()`'s branch swap replaces the DOM
with the correctly-marked template fragment and self-heals. Fixing Hono's
conditional-branch marker emission to match is tracked as a separate,
adapter-scoped follow-up.
