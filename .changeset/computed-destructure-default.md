---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/twig": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/rust": patch
"@barefootjs/xslate": patch
---

A props destructure default that is computed but reads no earlier prop (`{ b = ['y', ''].filter((x) => x !== '') }`, `{ n = 'abc'.length }`, `{ s = 'x'.toUpperCase() }`, `{ m = Math.max(1, 2) }`, `` { t = `a-${1 + 1}` } ``, `{ m = DEFAULT }` with a module string const) is now applied when the prop is omitted. Blade, erb, Jinja, MiniJinja, Mojolicious, Pebble, Twig and Xslate used to render such a prop without its default (an empty value) whenever the compile-time SSR seed could not evaluate it; their templates now apply the default themselves (`b ?? <default>`), the way they already did for a default that reads an earlier prop. The seed plan decides this once for every backend (`hasComputedDefault`); literal data defaults (`'x'`, `-1`, `['a']`, `{ a: 1 }`) keep their static seed.

Go applies such a default in `NewXxxProps` when the runtime evaluator can compute it (`'abc'.length`, `'x'.toUpperCase()`, `join`, `Math.max`, a template literal); an optional scalar prop with such a default now has `interface{}` `Input` / `Props` fields, as for a non-zero literal default, so an explicit `0` / `''` stays the caller's value. A default the evaluator can't compute (a callback such as `.filter((x) => …)`, a module const read) is still not applied on Go.

Twig: a template literal used as an operand (`` t ?? `a-${x}` ``) is now parenthesised, so `??` no longer splits the concatenation (it rendered `a-22` for `` t ?? `a-${1 + 1}` ``).
