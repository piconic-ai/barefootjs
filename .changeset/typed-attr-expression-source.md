---
"@barefootjs/jsx": patch
---

A type assertion in a JSX attribute value now reaches the Hono template. This covers a `<Ctx.Provider value={store as never}>`, a component prop `text={raw as string}`, an element attribute, and a `|| undefined` presence attribute. Before, the attribute text was type-stripped for the client JS, and the same text went into the `.tsx` template, so a template whose source needed the cast failed to type-check. The IR's `ExpressionAttr` carries the author's text as `typed`, and adapters with `preserveTypes` emit it while `expr` is unchanged. The client JS and the other adapters' output do not change.
