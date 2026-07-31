---
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

Declare the composite-loop-row nested-child render divergence

A new conformance fixture (`composite-row-child-component`) covers a shape the
corpus had no coverage for: a signal-driven `.map()` whose row root is a plain
element and whose subtree contains a child component. Every one of these
adapters diverges from the Hono reference on it, so each declares the
divergence in its exported `renderDivergences`.

No adapter behaviour changes — the divergences pre-date the fixture, which is
why they had gone unrecorded. What changes is the published declaration, and
with it the compatibility-matrix page, which now reports the gap instead of
implying parity.

Seven of the eight (blade, erb, jinja, mojolicious, rust, twig, xslate) share
one cause: the nested child renders through the runtime's `render_child`, which
mints its own `Badge_<random>` scope id instead of deriving the parent-scope +
mount-slot id (`<parent>_s0`) Hono emits. Content is correct; only `bf-s`
diverges. Tracked in
https://github.com/piconic-ai/barefootjs/issues/2444.

Go is a different, worse failure: one hoisted child-props field is built on the
parent outside the loop with no per-row data and passed for every row, so every
row renders the child with zero-value props. Tracked in
https://github.com/piconic-ai/barefootjs/issues/2445.
