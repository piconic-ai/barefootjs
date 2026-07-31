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
slotted component's own scope id from its mount slot. (A companion fix in
`renderChild` — pushing that derived scope while its template evaluates, so a
THIRD composition level derives its own scope instead of collapsing onto the
second — was tried but reverted: it collided with `comment: true` wrapper
transparency, e.g. a `renderNode`-style callback prop, whenever the wrapped
component's own first slot id coincides with the wrapper's slot number.
`grandchild-composition` stays a known limitation.)

Since a slotted child was previously unreachable by the primary
`(bf-h, bf-m)` SSR-scope lookup on every non-Hono adapter, this also fixes a
latent SSR-hydration bug: such a child was silently never initialized on the
client.

Graduates the `composite-row-child-component` conformance fixture (still
skipped on Go — that adapter's divergence is a different failure, tracked in
#2445) and the `composite-row-child-component` CSR conformance skip.

Fixes https://github.com/piconic-ai/barefootjs/issues/2444.
