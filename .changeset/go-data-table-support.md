---
"@barefootjs/go-template": minor
"@barefootjs/adapter-tests": patch
---

data-table component now renders on Go template (#1897). Three adapter-level capabilities were added:

- **Loop body children via companion defines**: children of loop-body components (e.g. `<TableCell>` inside `<TableRow>`) render through `bf_with_children` + `bf_tmpl` companion defines.
- **Wrapper struct + constructor baking**: a wrapper struct embeds the child component's Props, per-row datum fields, and child sub-component slots. The constructor bakes module-const arrays into Go struct literals.
- **Block-body memo resolution**: recognizes `() => { const k = getter(); if (!k) return MODULE_CONST; … }` via TS AST walk and bakes the constant's value when the guard signal starts falsy.

Also fixes marker conformance regex to capture `^`-prefixed slot IDs in `bfTextStart`/`bfText`/`text_start` calls.
