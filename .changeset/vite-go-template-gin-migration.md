---
"@barefootjs/vite": minor
"@barefootjs/go-template": minor
---

Add the `afterEmit` escape hatch, and `@barefootjs/go-template/vite`: a composed Vite plugin for Go

Every adapter's `.tsx` compile can produce a `types` fragment alongside its
template (e.g. Go's per-component Props struct) — but the fragment is
incomplete on its own: Go's, for instance, calls `randomID(6)` without
defining it, and per-component `package`/`import` headers need stripping
and merging into ONE file Go's compiler will accept (`html/template`
adapters don't get to just concatenate). The legacy CLI did this combining
in each adapter's `barefoot.config.ts` `postBuild` hook; `@barefootjs/vite`
had no equivalent, so an adapter migrating onto it lost the ability to
produce a compilable backend output at all.

`afterEmit` closes that gap with the narrowest context that can: `types`
(a `Map<absolute source path, types content>`), `projectDir` /
`templatesDir` / `outDir`, and `mode: 'build' | 'dev'` — fired once at the
end of EITHER eager pass, not just `vite build`'s `writeBundle` (an
adapter's derived output, like Go's `components.go`, has to exist for
`go run .` to even compile in dev). It deliberately never carries emitted
client JS: that's the one thing CLAUDE.md's "never add compiler
options/hooks for tool-specific output rewriting" rule exists to keep off
the table, and the type itself — not just convention — makes handing it
over impossible.

This option is aimed at an adapter's own `/vite` subpath (e.g.
`@barefootjs/go-template/vite`, added in a follow-up commit on this same
PR), which wires its own `afterEmit` internally to combine `types` into one
backend-native file — not something most end users are expected to pass
directly.

## `@barefootjs/go-template/vite`

A new subpath exporting `barefoot` (named AND default, matching core's
own `packages/vite/src/index.ts` shape exactly) — a Go-specific
COMPOSITION of core's `barefoot()`, not a new plugin implementation:

```ts
import { barefoot } from '@barefootjs/go-template/vite'

export default defineConfig({
  base: '/static/build/',
  build: { outDir: 'static/build' },
  plugins: [barefoot({
    components: ['src/components'],
    templates: 'internal/views',
    packageName: 'main',
    typesOutputFile: 'components.go',
  })],
})
```

No `adapter` option — this constructs `GoTemplateAdapter` itself and wires
its own `afterEmit` to combine every discovered file's `types` fragment
into one compilable `components.go` via the EXISTING, already-pure
`combineGoTypes` (`@barefootjs/go-template/build`) — reused, not
reimplemented. Ports `packageName` / `typesOutputFile` (default
`components.go`) / `manualTypes` / `transformTypes` from `./build`'s
`createConfig`, plus its write-if-changed behavior (an unrelated eager
pass touching `components.go`'s mtime would falsely trip a Go-side file
watcher like `air`). `./build` and `createConfig` are NOT removed — both
subpaths coexist until the legacy CLI itself is retired in a later PR.
