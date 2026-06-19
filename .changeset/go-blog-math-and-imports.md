---
"@barefootjs/go-template": patch
---

Go template adapter codegen fixes surfaced by bringing the shared blog islands to the Go/Chi integration.

- **`Math.min` / `Math.max`** now lower to the `bf_min` / `bf_max` runtime helpers (two-arg form; the N-arg form still falls back to the standard BF101 unsupported-call diagnostic via the arity gate). Previously `Math.min(...)` emitted a non-existent `.Math.Min` field access that crashed at execute time.
- **Nested arithmetic** parenthesises compound operands, so `(a / b) * c` emits `bf_mul (bf_div .A .B) .C` instead of `bf_mul bf_div .A .B 100`, which handed `bf_mul` four arguments. Comparisons (`gt`/`lt`/`eq`/…) wrap compound operands the same way.
- **Module numeric consts** (`const TRACK = 8`) inline their literal value rather than emitting a `.TRACK` Props field that never exists (mirrors the existing module string-const inlining).
- **Combined types file** adds the `"strings"` import when the merged constructors reference `strings.*` (a `searchParams()`-backed component emits `strings.TrimRight` for its router base), fixing an `undefined: strings` compile error in the generated types.
