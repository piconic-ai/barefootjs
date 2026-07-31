---
"@barefootjs/jsx": patch
"@barefootjs/client": patch
"@barefootjs/hono": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

Fix scope id derivation for a child component nested inside a dynamic loop row

A component nested below a loop row root (e.g. `<li><Badge/></li>` inside
`{rows().map(row => <li>…</li>)}`) now derives its `bf-s` scope id from
`<parentScope>_<slot>`, matching the Hono reference, instead of getting a
freshly randomized `Name_<id>` on every other adapter and on CSR. A row-root
component (`{rows().map(row => <Row/>)}`) is unaffected — it keeps its own
randomized id.

The fix is IR-driven: a new `IRComponent.loopItemRoot` flag (set once, in the
loop-IR builder, only on a DIRECT loop-body member) backs a single shared
predicate, `derivesScopeFromSlot()`, that every backend now consults instead
of a mutable "am I inside a loop" flag that couldn't distinguish a row root
from a component nested below it. Hono's own `renderComponent` branch
selector is refactored onto the same IR flag, so the policy is expressed once
rather than approximated per adapter.

On the client runtime, `createComponent`/`materializeComponent` now derives a
slotted component's own scope id from its mount slot, and `renderChild`
pushes that derived scope while its template evaluates — fixing a second,
related bug where a THIRD composition level (a grandchild rendered by a
nested `renderChild()` call) collapsed back onto the second level's scope
instead of deriving its own (`grandchild-composition`).

Since a slotted child was previously unreachable by the primary
`(bf-h, bf-m)` SSR-scope lookup on every non-Hono adapter, this also fixes a
latent SSR-hydration bug: such a child was silently never initialized on the
client.

Graduates the `composite-row-child-component` conformance fixture (still
skipped on Go — that adapter's divergence is a different failure, tracked in
#2445) and the `composite-row-child-component` / `grandchild-composition`
CSR conformance skips.

Fixes https://github.com/piconic-ai/barefootjs/issues/2444.
