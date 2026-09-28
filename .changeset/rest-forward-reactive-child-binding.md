---
"@barefootjs/jsx": patch
---

A prop that reaches a child component's root only through a statically-expanded, closed-type `{...rest}` spread (e.g. `function Child({ variant, ...rest }) { return <span {...rest} /> }`) now updates reactively on its own. Previously the expanded attribute read the destructured `rest` object once at construction time and never again, so a value that started `undefined` (SSR renders no attribute at all) never reached the DOM once set later on the client. The new binding also leaves alone a rest key that collides with an explicit attribute on the same element (the explicit one keeps winning, matching plain object-spread order) and a rest key that isn't a plain DOM attribute (an event handler, `children`), matching what `applyRestAttrs` already excludes. Closes #3057.
