---
"@barefootjs/jsx": minor
"@barefootjs/vite": minor
"@barefootjs/blade": minor
"@barefootjs/erb": minor
"@barefootjs/go-template": minor
"@barefootjs/hono": minor
"@barefootjs/jinja": minor
"@barefootjs/mojolicious": minor
"@barefootjs/rust": minor
"@barefootjs/twig": minor
"@barefootjs/xslate": minor
---

Emit `<link rel="modulepreload">` hints for a component's transitively-shared chunks

A compiled template registers exactly ONE script — the component's own entry:

```js
registerComponentScripts(["/integrations/hono/static/components/assets/TodoApp.tsx-CtatJ74J.js"])
```

But that entry is not a leaf. Vite's build manifest for the same component says:

```json
"../shared/components/TodoApp.tsx": {
  "file": "assets/TodoApp.tsx-CtatJ74J.js",
  "imports": ["_index-xrhpkKRC.js", "../shared/components/TodoItem.tsx"]
}
```

and `TodoItem.tsx` in turn imports `_index-xrhpkKRC.js` (the shared runtime
chunk, a leaf). So the browser's real load sequence was two sequential waves:

1. fetch + parse `TodoApp.tsx-<hash>.js`
2. only now discover, and fetch, `TodoItem.tsx-<hash>.js` and `index-<hash>.js`

Nothing emitted a `modulepreload` hint anywhere in the repo, so wave 2 always
cost a full extra round trip. On localhost that is invisible — which is
exactly why the benchmark suite does not catch this win — but on a
100ms-RTT connection it is 100ms of dead time before an island can hydrate.

`AdapterGenerateOptions.preloadAssets` (a sibling of `scriptAssets`) carries
an ordered, fully-resolved list of the entry's transitive chunk URLs,
excluding the entry's own file. `@barefootjs/vite`'s `resolvePreloadAssets`
resolves it from the build manifest by walking `entry.imports`
breadth-first (deterministic order, deduped, cycle-safe) — deliberately NOT
following `dynamicImports`, since a dynamic import is by definition not
needed for first paint. Every adapter emits a `<link rel="modulepreload"
crossorigin href="…">` immediately before its `scriptAssets` registrations,
in each adapter's own native form. `undefined` means "no preload
information" (emits nothing); `[]` means "resolved, nothing to preload"
(also emits nothing) — the same `undefined`/`[]` distinction `scriptAssets`
already draws. `skipScriptRegistration` still wins over both unconditionally.

In dev, Vite serves unbundled modules with its own on-demand dependency
pre-bundling — there is no stable, hashed chunk graph to preload, so
`preloadAssets` is always `[]` there.

Purely additive: with `preloadAssets` unset (the default) every existing
caller keeps byte-identical output.
