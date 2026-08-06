---
"@barefootjs/vite": minor
---

Per-directory `cssLayerPrefix` and `skipDirs` on `components` entries

`site/ui/build.ts` compiles library components (`ui/components`) with
`cssLayerPrefix: 'components'` and app/docs components without it — the
cascade contract `site/ui/styles/globals.css` declares
(`@layer preflights, base, shortcuts, components, default`): library base
classes land in `@layer components`, user override classes stay un-layered
in `default`, so an override always wins regardless of specificity or
UnoCSS emission order. That distinction is load-bearing — `site/ui/components`
passes `className` overrides roughly 490 times. `@barefootjs/vite`'s
`barefoot()` plugin couldn't express it: whether a file needs a cascade
layer depends on WHICH `components` entry it came from, and
`BarefootViteOptions` is deliberately capped at exactly three fields.

Separately, `site/ui/build.ts` skips any directory literally named `shared`
under its roots (utility modules and non-component layouts live there).
The low-level `discoverComponentFiles` already supported a `skipDirs`
option; nothing in the Vite plugin plumbed it through.

Both are directory-scoped compile behaviors, so both ride on the
`components` entry itself instead of becoming 4th/5th top-level options.
`components` widens from `string[]` to `(string | ComponentDirEntry)[]`:

```ts
export interface ComponentDirEntry {
  dir: string
  cssLayerPrefix?: string
  skipDirs?: string[]
}
```

A plain string entry is exactly equivalent to `{ dir: string }` — every
existing `vite.config.ts` in this repo (and `discoverComponents`'s two
external consumers, `integrations/h3`/`integrations/elysia`) keeps
compiling and behaving byte-identically, confirmed by diffing
`integrations/hono`'s built `dist/components/` before and after this
change. `components` entries are processed in array order, and that order
is also the precedence when the same file is reachable under more than
one entry: the first entry's `cssLayerPrefix`/`skipDirs` win, matching the
first-writer-wins precedence `@bf-child:` name resolution already
documents.

`skipDirs` gates BOTH halves of the plugin — the eager pass's discovery
walk AND the `transform`/dev-watcher gate (`isUnderComponentDir`). Gating
only discovery would have been a half-fix: a file living in a skipped
subdirectory can still be reached by an ordinary relative `import` from a
non-skipped sibling (`site/ui`'s `PageNavigation.tsx`, imported by pages
out of a skipped `shared/` dir, is exactly this shape), and without the
second gate the graph pass would compile it anyway.
