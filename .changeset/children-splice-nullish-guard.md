---
"@barefootjs/client": patch
"@barefootjs/jsx": patch
---

Stop an unguarded `{props.children}` from rendering the literal text
`undefined` on a pure-CSR mount when the caller passes no children.

The client template emitted `children` as a bare `${_p.children}` splice, and a
caller that passes no children leaves the key absent from the props object
entirely — so the splice stringified `undefined` into the DOM. SSR and
SSR+hydration both rendered an empty body, which broke the three-way contract on
the SSR-equals-CSR-mount leg, and only there: an SSR-first check could not see
it. The shape is ordinary component code, and seventeen fixtures in the corpus
(kbd, dialog, tooltip, select, tabs, popover, combobox, …) were emitting it.

The new `markupOrEmpty` runtime helper does exactly one thing: a nullish value
becomes the empty string, every other value passes through completely
unescaped. It is deliberately not `escapeTextOrMarkup`, which its sibling props
use — that helper only lets a value through unescaped when it carries the
`bfMarkup()` brand, and a children payload never does, since
`materializeComponent` joins children into a plain HTML string before the
template lambda runs. Routing children through it would HTML-escape real markup
into visible `&lt;span&gt;` text on every call that actually has children. The
guard matches how the other two families already render the same source: Hono's
JSX runtime renders `undefined` as nothing, and the DSL adapters route through
`bf.string(children)`.

On the compiler side the decision lives in one place. `bareSpliceExpr` is the
single door for the no-`slotId` splice — the counterpart to `escapeTextSlotExpr`
for the branch that must not escape — and all four `case 'expression'` template
builders call it rather than each carrying its own copy.

The fixture corpus had been routing around this rather than pinning it:
`jsx-element-prop-no-children` and `component-with-jsx-children` both guarded
their source with `?? ''`, which is why no conformance layer reported it. Both
guards are dropped and a dedicated fixture with the unguarded source is added.
