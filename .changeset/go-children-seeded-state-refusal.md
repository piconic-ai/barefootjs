---
"@barefootjs/go-template": patch
---

A child component that computes a signal seed or memo from its children (`createSignal(props.children ?? 'missing')`) or from another JSX-valued prop is now refused with BF101 when the call passes it children (or a JSX prop) that read the caller's data, or calls it from a loop row. The Go template renders such children only when the template executes, after the child's constructor has computed its state, so the child used to render its fallback (`missing`) where Hono renders the children. This includes a signal or memo named like the prop that transforms it (`const [children] = createSignal(props.children ? 'given' : 'none')`); one that passes the prop through unchanged still renders. Static text children (`<Note>own</Note>`) outside a loop row still reach the constructor and render as before.

A JSX-valued prop other than `children` that reads a loop row (`header={<i>{x}</i>}`) on a component in that row is now refused with BF101 instead of being dropped from the render without a diagnostic.
