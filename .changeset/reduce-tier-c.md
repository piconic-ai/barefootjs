---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
---

Lower `Array.prototype.reduce(fn, init)` arithmetic-fold catalogue to the template-language adapters (#1448 Tier C).

The shapes that recur across the demo components (`playlist.reduce((s, t) => s + t.duration, 0)`, view-count / visitor sums, …) now compile on both template adapters. The accepted catalogue mirrors the `.sort` precedent (a finite, structured form rather than an arbitrary reducer body):

- `arr.reduce((acc, x) => acc + x, 0)` — numeric sum over self
- `arr.reduce((acc, x) => acc + x.field, 0)` — numeric sum over a struct field
- `arr.reduce((acc, x) => acc * x.field, 1)` — numeric product
- `arr.reduce((acc, x) => acc + x.field, '')` — string concatenation (string init flips `+` to concat)
- single-`return` block bodies are unwrapped to the returned expression

The accumulator must be the binary expression's left operand (`acc + x`, not `x + acc`), the per-item operand must be the item param or a single non-computed field access on it, and the init must be a number or string literal. Anything else (subtraction / division, deep field access, object-building reducers, 3- / 4-param forms, `.reduce(fn)` without an initial value) refuses with BF101 and keeps `/* @client */` as the escape hatch. `.reduceRight` stays refused entirely.

- Parser: new `array-method` variant `reduce` with a structured `ReduceOp` (op / key / type / init) extracted at parse time; `reduce` stays in `UNSUPPORTED_METHODS` so the no-init fall-through still refuses loudly.
- Emitter: new `reduceMethod()` arm on `ParsedExprEmitter` — adding it makes every adapter implementor a TS compile error until they handle it (the same drift defence sort uses).
- Go: new `bf_reduce` runtime helper folding to float64 for numeric / Go string for concat.
- Mojo: new `bf->reduce` helper folding via Perl numeric / string operators.

Float stringification can diverge from JS for inexact binary fractions (e.g. `0.1 + 0.2`); integer sums — the common SSR case — agree across all three adapters.
