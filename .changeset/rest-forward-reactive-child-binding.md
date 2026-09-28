---
"@barefootjs/jsx": patch
---

A prop that reaches a child component's root only through a statically-expanded, closed-type `{...rest}` spread (e.g. `function Child({ variant, ...rest }) { return <span {...rest} /> }`) now updates reactively on its own. Previously the expanded attribute read the destructured `rest` object once at construction time and never again, so a value that started `undefined` (SSR renders no attribute at all) never reached the DOM once set later on the client. Closes #3057.
