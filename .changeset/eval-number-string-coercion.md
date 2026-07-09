---
"@barefootjs/go-template": patch
"@barefootjs/erb": patch
---

Make the `ParsedExpr` evaluator's `Number()` / ToNumber string coercion JS-faithful on the Go and Ruby backends, closing two divergences from the JS reference (the evaluator subset allows none). Both surface when a `map` / `filter` / `sort` / `reduce` callback body coerces a string field, e.g. `.filter(x => Number(x.code) > 0)`.

- **Ruby (`@barefootjs/erb`)** — `Number("5.")` **raised** `ArgumentError` (Ruby's `Float()` rejects a trailing decimal point), aborting SSR with a 500 where JS returns `5`. `parse_numeric_string` now normalizes a `.` not followed by a digit (`"5."` → `"5"`, `"5.e3"` → `"5e3"`) before converting, and wraps the conversion so a coercion can never raise (falls back to `NaN`). The accepted grammar is unchanged.
- **Go (`@barefootjs/go-template`)** — `evalToNumber` delegated to `strconv.ParseFloat`, which **over-accepts** forms JS's `Number()` rejects: underscore digit separators (`"1_000"` → `1000`, JS `NaN`) and hex-float syntax (`"0x1p4"` → `16`, JS `NaN`), and turned decimal overflow into `NaN` (`"1e1000"`, JS `Infinity`). It now gates on the JS decimal `StringToNumber` grammar (anchored regexp: sign, integer/fraction digits, exponent — ASCII digits only), handles the exact `Infinity` / `+Infinity` / `-Infinity` spellings, and passes `strconv.ErrRange` results (±Inf) through instead of discarding them. Radix-prefixed integer strings (`0x` / `0o` / `0b`) remain `NaN`, unchanged (the documented radix-divergence region shared with the other backends).

Ten `Number(...)` cases pinning the decimal numeric-string grammar (leading/trailing dot, sign, exponent, whitespace, underscore rejection, hex-float rejection, overflow → ±Infinity) are added to the shared evaluator vector corpus (`eval-vectors.json`), so all five evaluator backends (Go, Ruby, Perl, Python, PHP) are held to JS parity here going forward.
