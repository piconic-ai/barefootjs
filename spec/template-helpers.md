# Template Helper Conformance Spec

Language-independent specification for the **pure value helpers** that
adapters use to lower JavaScript expressions into template languages —
the functions registered as `bf_*` in the Go adapter's
`runtime/bf.go` FuncMap, implemented as `BarefootJS.pm` methods in the
Perl adapters, or lowered to native host operators where the host
language already has JS-compatible semantics.

The goal is that a template expression compiled from JSX produces the
**same value** on every backend as the JS reference (Hono/CSR) path.
This spec, together with the golden vectors described below, is the
contract a new language adapter (Python, Ruby, …) implements against:
write the helpers idiomatically, pass the vectors, done. No FFI, no
shared binary — each backend stays pure host-language.

## Scope

In scope: helpers that are **pure functions of their arguments** —
arithmetic, string, array, and coercion operations (`add`, `slice`,
`pad_start`, `number`, …).

Out of scope: helpers coupled to render state (`bfScripts`,
`bfPropsAttr`, `bfHydrationAttrs`, `bfPortalHTML`, context, streaming).
Those are covered by the adapter conformance fixtures in
`packages/adapter-tests/fixtures/`, which exercise full IR → HTML
rendering per adapter.

## Reference semantics

**JavaScript is normative.** Every catalogue entry has a JS reference
implementation in `packages/adapter-tests/helper-vectors/cases.ts`.
Expected values in the golden vectors are **computed by executing that
reference**, not transcribed by hand — JS parity is mechanical.

### Compatibility contract

- **Value-compat, not type-compat.** Backends may use a different
  runtime type as long as the value is equal. Example: Go's `bf.Add`
  returns `int` when both operands are int-like; JS has only `number`.
  Harnesses compare numbers numerically, never by type or by printed
  representation.
- **Numbers are IEEE-754 doubles.** Arithmetic follows double
  semantics, including rounding (`0.1 + 0.2` →
  `0.30000000000000004`).
- **Integer domain is the JS safe range** (|n| ≤ 2^53 − 1, with exact
  results up to 2^53). Outside that range behavior is
  **adapter-defined**: Perl lowers arithmetic to native ops whose IV
  arithmetic is 64-bit exact, while JS and Go (which round-trips
  through `float64`) lose precision identically. Vectors never test
  outside the safe range.
- Divergences a backend cannot reasonably avoid are documented per
  catalogue entry and excluded from the vectors.

## Golden vectors

`packages/adapter-tests/helper-vectors/vectors.json` — generated,
committed, and consumed by one thin harness per backend.

```json
{
  "version": 1,
  "cases": [
    { "fn": "add", "args": [0.1, 0.2], "expect": 0.30000000000000004,
      "note": "IEEE-754 double rounding" }
  ]
}
```

- `fn` is the **canonical helper id** from this catalogue (no `bf_`
  prefix, no host-language casing).
- `args` / `expect` are plain JSON values: finite numbers, strings,
  booleans, `null`, and arrays/objects thereof.
- **Non-finite sentinel**: a non-finite number in `expect` is encoded
  as `{"$num": "NaN" | "Infinity" | "-Infinity"}` (the `$num` key is
  reserved; helper data must not use it). Arguments must stay finite —
  the generator refuses non-finite `args`; composition cases (e.g.
  `floor(number("x"))`) can lift that later if needed. `undefined` is
  never representable.
- Each case carries a human-readable `note` naming the spec rule it
  pins.

### Regenerating

```sh
cd packages/adapter-tests && bun run generate:helper-vectors
```

A freshness test (`src/__tests__/helper-vectors.test.ts`, run by
`ci.yml`'s `bun test packages/adapter-tests`) fails when
`vectors.json` is out of date with `cases.ts`.

### Harnesses

| Backend | Harness | CI |
|---------|---------|----|
| JS (reference) | `helper-vectors/generate.ts` computes `expect` by executing the reference | `ci.yml` (freshness test) |
| Go `html/template` | `packages/adapter-go-template/runtime/vectors_test.go` | `ci-go-template.yml` (`go test`) |
| Perl (Mojolicious / Xslate) | `packages/adapter-perl/t/helper_vectors.t` | `ci-perl-dist.yml` (`make test`) |

Harnesses **fail loudly on an unknown `fn`** — adding a case for a
helper without binding it in every harness is a CI failure, so the
backends cannot silently fall behind the catalogue. The Go and Perl
harnesses skip when `vectors.json` is absent (published Go module /
CPAN dist consumers don't receive the monorepo file).

Each harness binds a canonical id to **the exact code shape the
compiled templates execute**: where an adapter lowers an operation to
a native host operator instead of a helper function (see the lowering
tables below), the harness binds the native operator, so the vectors
test what production templates actually run.

## Adding a catalogue entry

1. Add the entry to the catalogue below: semantics, lowering per
   adapter, edge-case rules, documented divergences.
2. Add the JS reference implementation and cases to
   `helper-vectors/cases.ts` — cover each edge-case rule with at least
   one vector.
3. Regenerate `vectors.json`.
4. Bind the id in `vectors_test.go` (Go) and `helper_vectors.t`
   (Perl). Run both harnesses; fix implementations (or document a
   divergence and drop the case) until green.

## Catalogue

### add

JS numeric addition: `a + b`.

| Backend | Lowering |
|---------|----------|
| Hono / CSR | native JS `+` |
| Go template | `{{bf_add a b}}` → `bf.Add` |
| Mojolicious / Xslate | native Perl `+` |

Rules:

- Operands are **numbers**. String-operand `+` (JS concatenation) is
  not part of this entry; template-side string building is lowered
  through interpolation, and feeding strings to `add` is
  adapter-defined.
- IEEE-754 double semantics for the result value (see contract above).
- Go's int-preserving return (`Add(1, 2)` → `int 3`) is value-equal
  and allowed under value-compat; the round-trip through `float64`
  keeps it within double semantics.

### sub / mul

JS numeric subtraction / multiplication: `a - b`, `a * b`.

| Backend | Lowering |
|---------|----------|
| Hono / CSR | native JS `-` / `*` |
| Go template | `bf_sub` / `bf_mul` → `bf.Sub` / `bf.Mul` |
| Mojolicious / Xslate | native Perl `-` / `*` |

Same rules as `add`: numeric operands, double semantics (including
rounding artifacts like `0.3 - 0.1` → `0.19999999999999998`),
int-preserving Go returns allowed under value-compat.

### div

JS numeric division: `a / b`. Always double division — `7 / 2` is
`3.5` even for integer operands.

| Backend | Lowering |
|---------|----------|
| Hono / CSR | native JS `/` |
| Go template | `bf_div` → `bf.Div` |
| Mojolicious / Xslate | native Perl `/` |

Rules:

- Domain: **divisor ≠ 0**. JS yields `±Infinity` / `NaN` for a zero
  divisor; Go's `bf.Div` deliberately returns `0` so a template render
  degrades instead of emitting `+Inf`, and Perl `/` dies. Zero-divisor
  behavior is adapter-defined, documented here, and excluded from the
  vectors.
- Double semantics for the quotient (`1 / 3` →
  `0.3333333333333333`).

### mod

JS remainder: `a % b`.

| Backend | Lowering |
|---------|----------|
| Hono / CSR | native JS `%` |
| Go template | `bf_mod` → `bf.Mod` |
| Mojolicious / Xslate | native Perl `%` |

Rules:

- Domain: **non-negative integer operands with divisor > 0**. Outside
  that the backends genuinely disagree and behavior is
  adapter-defined:
  - Negative operands: JS remainder takes the **dividend's** sign
    (`-7 % 3` → `-1`); Perl's `%` takes the **divisor's** sign
    (`-7 % 3` → `2`); Go's `%` matches JS.
  - Float operands: JS `%` is a float remainder (`7.5 % 2` → `1.5`);
    Go `bf.Mod` and Perl integer-context `%` truncate to integers.
  - Zero divisor: JS yields `NaN`; Go returns `0`; Perl dies.
- Within the domain, the result is the common integer remainder.

### neg

JS unary minus: `-a`.

| Backend | Lowering |
|---------|----------|
| Hono / CSR | native JS unary `-` |
| Go template | `bf_neg` → `bf.Neg` |
| Mojolicious / Xslate | native Perl unary `-` |

Numeric operand, double semantics. (`-0` is value-equal to `0` under
the vectors' numeric comparison; JSON cannot carry the sign of a
floating-point zero.)

### string

JS `String(v)`.

| Backend | Lowering |
|---------|----------|
| Hono / CSR | native `String(v)` |
| Go template | `bf_string` → `bf.String` |
| Mojolicious / Xslate | `bf->string` |

Rules:

- Numbers stringify in shortest round-trip form (`String(3.14)` →
  `"3.14"`); Go's `%v` matches JS. **Documented divergence**: Perl
  stringifies via `%.15g`, so doubles needing 16–17 significant
  digits differ (`String(0.1 + 0.2)`: JS `"0.30000000000000004"`,
  Perl `"0.3"`). Vectors stay within 15 significant digits.
- **Documented divergence**: `null`/`undefined` render as `""` on the
  template backends (deliberate SSR ergonomics — an unset prop must
  not surface as literal `"null"`/`"undefined"`), while JS
  `String(null)` is `"null"`. Excluded from vectors.
- **Documented divergence**: booleans — JS `String(true)` is
  `"true"`; Perl has no boolean type (template data carries `1`/`0`),
  so the Perl backends render `"1"`/`""`. Excluded from vectors.

### json

JS `JSON.stringify(v)` (single-argument form; no `replacer`/`space`).

| Backend | Lowering |
|---------|----------|
| Hono / CSR | native `JSON.stringify` |
| Go template | `bf_json` → `bf.JSON` |
| Mojolicious / Xslate | `bf->json` (backend JSON encoder) |

Rules:

- Value-compat, **not order-compat** (#1187): object key order is
  backend-defined (Go maps and JSON::PP-canonical sort
  alphabetically; JS preserves insertion order). Vectors use objects
  whose insertion order IS alphabetical so the serialized strings
  compare equal.
- `json(null)` → `"null"` on all backends.
- **Documented divergence**: booleans inside the value — Perl
  template data has no boolean type, so `true` round-trips as `1` on
  the Perl backends. Excluded from vectors.
- Top-level `NaN`/`±Infinity` serialize as `"null"` (JS behavior; Go
  carves this out explicitly). Nested non-finite values error on Go —
  adapter-defined, excluded.

### number

JS `Number(v)`.

| Backend | Lowering |
|---------|----------|
| Hono / CSR | native `Number(v)` |
| Go template | `bf_number` → `bf.Number` |
| Mojolicious / Xslate | `bf->number` |

Rules:

- Numeric input passes through; trimmed numeric strings parse
  (`"3.14"`, `"1e3"`, `"NaN"` → `NaN`); booleans coerce to `1`/`0`;
  non-numeric strings yield `NaN` (the first sentinel-encoded
  vectors).
- **Documented divergence**: JS `Number("")` and `Number(null)` are
  `0`; both template backends deliberately return `NaN` so silently
  zeroed empty input doesn't mis-shape downstream arithmetic.
  Excluded from vectors.
- **Documented divergence**: JS trims surrounding whitespace
  (`Number(" 8 ")` → `8`); Go's `strconv.ParseFloat` does not (→
  `NaN`). Domain is pre-trimmed strings; whitespace cases excluded.

### floor / ceil / round

JS `Math.floor(v)` / `Math.ceil(v)` / `Math.round(v)`.

| Backend | Lowering |
|---------|----------|
| Hono / CSR | native `Math.*` |
| Go template | `bf_floor` / `bf_ceil` / `bf_round` |
| Mojolicious / Xslate | `bf->floor` / `bf->ceil` / `bf->round` |

Rules:

- The operand routes through `number` coercion first (numeric strings
  accepted); results follow double semantics.
- `round` rounds half toward **+Infinity** in JS (`Math.round(-1.5)`
  → `-1`). Perl's `floor(n + 0.5)` matches JS exactly.
  **Documented divergence**: Go's `math.Round` rounds half away from
  zero (`-1.5` → `-2`); negative-half cases are excluded from
  vectors. Positive halves agree on all backends.
