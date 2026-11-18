---
"@barefootjs/jsx": patch
---

A conditional in a `.map()` row over a static (non-signal) array now stays live when its condition is fixed for the row but the row still needs wiring. Two cases were baked once and never updated:

- A branch that reads a signal, memo or prop, or holds an event handler or `ref`, while the condition reads only the row: `ROWS.map(r => <li>{r.on ? <b>{count()}</b> : <i>off</i>}</li>)` kept the first value of `count()`, and a handler inside the branch was never attached (#3911).
- A condition that reaches a signal only through a component-scope helper written as a `function` declaration: `function isSel(id) { return sel() === id }` with `ITEMS.map(it => <li>{isSel(it.id) ? <b>on</b> : <i>off</i>}</li>)` never switched branches, while the same helper written as an arrow did. A helper call that takes no row argument (`isOn() ? … : …`) never switched for either spelling (#3912).

Such a loop is now reconciled like a signal-backed one. A row whose condition and branches read only the row, a literal, or a local helper that reads no component state keeps the static path and its client output. A call to an imported helper is not followed and is treated as before.
