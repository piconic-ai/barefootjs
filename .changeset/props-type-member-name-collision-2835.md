---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

Fix #2835: for a whole, non-destructured `(props: Props)` parameter, `isArrayExprDirectPropRef`'s same-name terminal check (`isDirectPropBindingName`, jsx-to-ir.ts) read `ctx.patterns.props`, which includes every one of `Props`'s type-member names regardless of whether that name is bound to anything in the current component. An unrelated module or local identifier that happened to share a name with a `Props` member (e.g. a module `const base = [...]` alongside `type Props = { base: T[] }`) was misclassified prop-derived by that name collision alone — reproduces with zero aliasing involved, and pre-dates #2724.

`isDirectPropBindingName` now checks a new `ctx.boundPropNames` set (`boundPropLocalNames`, `props-binding.ts`) — the names the props parameter actually binds locally, empty for a whole `(props: Props)` parameter since its `propsParams` there are type-member names, not bindings. `ctx.patterns.props` itself is unchanged: it stays the wider set `isPropsReference`'s regex matching needs for `props.<key>` detection.
