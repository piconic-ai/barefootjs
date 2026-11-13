---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

An attribute bound to a loop row's optional member (`rows.map((r) => <li data-tone={r.tone} />)` where `tone?: string`) is omitted on a row that lacks the member or holds `null`, as Hono omits it, instead of rendering `data-tone=""` (#3728). The template adapters now read the nullish decision from the row's declared element type, through the same `BindingScope` row typing the other row reads use: a member read (`r.tone`, `r.meta.tone`), a destructured row param (`({ tone }) =>`) and a nested loop's rows are all covered, whether the loop ranges over a prop, a signal or a typed module const. An untyped module-const array of object literals is typed by the row shape the literal spells, a key some row omits being optional. A present value, `''` and `0` included, still renders.
