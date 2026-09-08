---
"@barefootjs/go-template": patch
---

Fix #2857: a `.filter()` predicate that referenced a root-scope value through an alias — a signal-getter alias (`const items__alias = items`, #2813's family) or a bare-props-form body-destructured renamed prop (`const { children: kids } = props`, #2788's family) — emitted a Go struct field derived from the raw local/alias name (e.g. `.Kids`) instead of the field the aliased entity actually seeds (`.Children`). That field was never populated by `New<Component>Props`, so `html/template` panicked at render time with `can't evaluate field ... in type ...`.

`renderFilterExprNode`'s `identifier` and `call` arms called `rootFieldRef` only for its BF101 registration side effect, then re-derived the emitted field name from the raw identifier instead of using `rootFieldRef`'s alias-resolved name. Both arms (and `rootFieldRef` itself) now share one alias-resolution helper (`resolveRootFieldAlias`).

Fixing this also surfaced a second, adjacent bug in the same `identifier` arm: a bare (non-alias, non-signal) root-scope reference inside a filter predicate — a memo, a plain derived const, or a renamed prop destructure — emitted a bare `.Field` instead of the `$.Field` every `.filter().map()` loop's `{{range}}{{if}}` gate requires to escape the current loop item and reach the root struct. That's now fixed too, since it blocked this same fix's own regression fixture from passing on real `go run`.
