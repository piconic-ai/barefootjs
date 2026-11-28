---
"@barefootjs/erb": patch
---

On ERB, the JSX children a component is called with are now captured as markup (`BarefootJS::SafeString`), so a component that holds them in state and prints that state (`const [value] = createSignal(props.children)`, `createSignal(props.children ?? 'missing')` or `createMemo(() => props.children ?? 'missing')`, `{value()}`), or forwards them into a nested component's prop that does, renders the children as Hono does: an element child as that element, and text children that read the caller's data with the caller's text slot markers. Both printed the children's markup as escaped text before. A `children` attribute holding a string (`<Note children="a<b" />`) is still escaped text.

A dynamic attribute value is now escaped through `bf.h_attr`, which escapes a `SafeString` too, so captured children or a JSX-valued prop bound into an attribute (`title={value()}`, `title={props.header}`) renders as escaped markup text, quotes included, as Hono renders it, instead of raw markup whose quotes ended the attribute value (a JSX-valued prop did that before this change as well).
