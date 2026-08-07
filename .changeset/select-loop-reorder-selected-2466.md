---
"@barefootjs/jsx": patch
---

Fix controlled `<select>` losing its selection when an index-keyed
`.map()`-rendered `<option>` loop reorders (#2466).

`lowerFormControlValueSsr` (`jsx-to-ir.ts`) already distributed
`selected={(value) === 'opt'}` onto statically-valued `<option>`s (#2464);
a `.map()`-rendered `<option>` with an EXPRESSION value (`value={o.id}`,
the shape every loop row uses) was left unhandled and silently froze at
its SSR-time `selected` state. Reversing an index-keyed loop (`key={i}`)
never moves the physical `<option>` nodes — `applyItem` rewrites
`option.value` and its label text in place — so the previously-selected
DOM node kept `selected` while the item underneath it changed, and
`select.value` drifted from the controlled signal.

`selected` is now distributed onto a loop-row `<option>` too, compared
against the option's own value EXPRESSION (`(value) === (o.id)`) rather
than a `JSON.stringify`'d literal. That makes it an ordinary per-row
reactive attribute (a boolean DOM-property write, `isBooleanAttr`), so it
rides the loop's existing per-row reactive-attribute machinery —
`applyItem` (row rewritten under a stationary key) and `applyOuter` (the
controlled signal itself changes) both recompute it, alongside the eager
`mapArray` row effect for loops outside the lazy-row gate. Keyed loops
(`key={o.id}`) were already correct (the DOM node itself moves) and are
unaffected.

New coverage: a compiler unit pin (`form-control-value-ssr.test.ts`)
asserting `selected` rides both `applyItem` and `applyOuter` for an
index-keyed loop, and a new `select-loop-selected` adapter-conformance
fixture (SSR `expectedHtml` generated from the Hono reference, also
exercised by `csr-conformance.test.ts`).
