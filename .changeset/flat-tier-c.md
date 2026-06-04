---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
---

Lower `Array.prototype.flat(depth?)` to the template-language adapters (#1448 Tier C).

The value-returning `.flat()` now compiles on both template adapters instead of refusing with BF101. The flatten depth is validated to a literal and normalised at parse time:

- `arr.flat()` — flatten one level (the JS default)
- `arr.flat(n)` — flatten `n` levels (a fractional literal truncates toward zero; a `0` / negative depth normalises to "no flatten" → shallow copy, matching JS)
- `arr.flat(Infinity)` — flatten fully
- a **non-literal** depth refuses with BF101 (it can't be resolved at template time) and keeps `/* @client */` as the escape hatch — `@client` is not suggested for this case since the remedy is a literal depth or pre-computing

Non-array nested elements are preserved (JS only flattens nested arrays). This is the first half of the `.flat` / `.flatMap` Tier C row; the value-returning `.flatMap` stays deferred (the JSX-returning `.flatMap` already lowers as an `IRLoop`).

- Parser: new `array-method` variant `flat` carrying a structured `FlatDepth` (`number | 'infinity'`); `flat` is removed from `UNSUPPORTED_METHODS`.
- Emitter: new `flatMethod()` arm on `ParsedExprEmitter` — adding it makes every adapter implementor a TS compile error until handled (the same drift defence sort / reduce use).
- Go: new `bf_flat` runtime helper (reflect-based recursive flatten; `-1` is the `Infinity` sentinel).
- Mojo: new `bf->flat` helper (recursive ARRAY-ref flatten; same `-1` sentinel).

Conformance fixtures (`array-flat`, `array-flat-depth`, `array-flat-infinity`) pin byte-equal output across Hono/CSR, Go, and Mojo.
