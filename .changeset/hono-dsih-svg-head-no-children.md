---
"@barefootjs/hono": patch
---

Fix `dangerouslySetInnerHTML` throwing on childless `<svg>`/`<head>` elements through `@barefootjs/hono/jsx` (#2557)

`String(jsx('svg', { dangerouslySetInnerHTML: { __html: '...' } }))` threw
`Error: Can only set one of \`children\` or \`props.dangerouslySetInnerHTML\`.`
even though no children were passed at all.

Root cause is in hono's own JSX runtime (`hono/dist/jsx/base.js`'s
`jsxFn`), not in anything BarefootJS wrote: for `<svg>` and `<head>`
specifically, `jsxFn` always wraps the real children in an internal
namespace-context node — `[new JSXFunctionNode(nameSpaceContext, ...)]` —
even when the caller passed zero children. That phantom wrapper makes the
outer `JSXNode`'s `children.length > 0`, which trips hono's own
`children`-vs-`dangerouslySetInnerHTML` conflict guard for every childless
`<svg>`/`<head>` element using `dangerouslySetInnerHTML`. Ordinary tags
(e.g. `<div>`) never hit this — only `svg`/`head` get the namespace
wrapper — which is why the bug only reproduces on those two tags.

`packages/adapter-hono/src/jsx/jsx-runtime/index.ts` (`jsx`/`jsxs`) and
`packages/adapter-hono/src/jsx/jsx-dev-runtime/index.ts` (`jsxDEV`) now
resolve `dangerouslySetInnerHTML` into real `children` themselves —
mirroring what hono's guard expects — before delegating to hono's
runtime, whenever no explicit `children` prop is present. A genuine
conflict (both real children AND `dangerouslySetInnerHTML` passed
together) is left untouched and still rejected by hono's own guard.

Any compiled template whose element carries `dangerouslySetInnerHTML`
previously crashed at SSR through this runtime if the element was an
`<svg>` or `<head>` with no other children (a common shape for inlined
icon markup).
