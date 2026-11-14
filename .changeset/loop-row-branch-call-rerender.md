---
"@barefootjs/jsx": patch
---

A conditional branch of a `.map()` row that calls a function now updates when the row is reused with a new item under the same key. In `{rows().map(row => <li key={row.id}>{row.wait === 0 ? '0s' : fmt(row.wait)}</li>)}` the branch `fmt(row.wait)` kept the value the row was first rendered with, while the same call directly in the row (`<li>{fmt(row.wait)}</li>`) updated. It affected any call in a branch that is a bare expression: a module, imported or component function, a method (`row.label.toUpperCase()`), a global (`String(row.n)`), a call inside a template literal, the right side of `&&`, and a signal read through a call (`fmt(scale())`) (#3894).

One branch is still not re-run, as before: a call to a callback the component received as a prop (`props.renderNode ? props.renderNode(node) : <Default />`). The callback may return an element with its own state, so the row keeps the element it got when the branch was mounted. A callback prop whose declared type returns only strings, numbers, booleans, `null` or `undefined` (`format: (n: number) => string`) is re-run like any other call.
