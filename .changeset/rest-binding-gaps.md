---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

Rest-binding and body-destructure shapes that compiled without a diagnostic and rendered wrong now render as JS does or are refused:

- An attribute written before a closed-type `{...rest}` spread (`<Chip tone="x" {...rest} />`) keeps its value when the caller omits that key, on elements and child components, and hydration binds the same fallback (`_p.key ?? (earlier)`). A value that may have an effect, or a JSX element value, is refused with BF021.
- A loop row or callback parameter named like the component's rest binding shadows it: `{...rest}` inside `rows.map(rest => …)` spreads the row.
- A member read of a props-object body rest (`const { label, ...rest } = props`, `rest.id`) reads the prop on every adapter. A read of a key the destructure takes (`rest.label`), and a read or spread of the rest inside a binding that shadows the props name (`rows.map(props => …)`), are refused with BF101.
- A component-body object destructure the compiler cannot collect (a rest element from a source other than the props object, a non-literal default, a source that is not a plain name, a `let` destructure) is refused with BF101 instead of being dropped.
- Go: a child prop that reads the component's rest props through an expression (`tone={rest.tone ?? 'x'}`) is evaluated instead of omitted.
