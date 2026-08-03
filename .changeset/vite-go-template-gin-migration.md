---
"@barefootjs/vite": minor
---

Add the `afterEmit` escape hatch: `@barefootjs/vite`'s narrow per-language extension point

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
