# Template Helper Conformance Spec

Language-independent, **JS-normative** specification for the pure
value helpers that adapters use to lower JavaScript expressions into
template languages (arithmetic, string, array, coercion, and the
accepted higher-order projection catalogue).

The goal: a template expression compiled from JSX produces the same
value on every backend as the JS reference path. This spec plus the
golden vectors are the contract a new language adapter (Python,
Ruby, …) implements against — write the helpers idiomatically, pass
the vectors, done. No FFI, no shared binary.

**This document is backend-neutral.** It never records which adapter
lowers an operation how, nor which adapter diverges where. Per-backend
status — supported / divergent / unsupported — lives in each backend's
harness as machine-checked declarations (see "Adapter status model"),
so adding an adapter never edits this file.

## Scope

In scope: helpers that are pure functions of their arguments.

Out of scope: helpers coupled to render state (`bfScripts`,
`bfPropsAttr`, hydration markers, context, streaming, spread-attrs) —
covered by the adapter conformance fixtures in
`packages/adapter-tests/fixtures/`.

## Reference semantics

**JavaScript is normative.** Every catalogue entry has a JS reference
implementation in `packages/adapter-tests/vectors/cases.ts`;
expected values are **computed by executing it**, never transcribed.

Compatibility contract:

- **Value-compat, not type-compat.** A backend may return a
  differently-typed value as long as it is value-equal (e.g. an
  integer-typed `3` for JS number `3`; truthy `1`/`0` for booleans).
  Harnesses compare numbers numerically, booleans by truthiness.
- **Numbers are IEEE-754 doubles**, including rounding artifacts
  (`0.1 + 0.2` → `0.30000000000000004`) and safe-integer behavior
  (exact up to 2^53).
- Inputs on which JS itself throws (e.g. a negative `repeat` count)
  are out of vector scope; backend behavior there is undefined by
  this spec.
- A backend that deliberately diverges from a rule pins its actual
  value in its own divergence declaration — the spec text stays
  JS-only.

## Golden vectors

`packages/adapter-tests/vectors/vectors.json` — generated,
committed, consumed by one thin harness per backend.

```json
{ "fn": "add", "args": [0.1, 0.2], "expect": 0.30000000000000004,
  "note": "IEEE-754 double rounding" }
```

- `fn` is the canonical helper id (no `bf_` prefix, no host casing).
- **Case key**: `fn + "/" + note`, unique across the file (enforced
  by the freshness test). Harness declarations reference this key, so
  treat notes as stable identifiers — renaming one re-keys its
  declarations (the harnesses fail loudly on unknown keys).
- `args` / `expect` are plain JSON. Non-finite numbers in `expect`
  use the reserved sentinel `{"$num": "NaN" | "Infinity" |
  "-Infinity"}`; a JS `undefined` expect encodes as `null` (backends
  have a single absent value). Args must stay finite.

Regenerate with `cd packages/adapter-tests && bun run
generate:helper-vectors`; the freshness test in
`src/__tests__/helper-vectors.test.ts` fails CI when `vectors.json`
drifts from `cases.ts`.

## Adapter status model

Each backend ships one harness file (currently:
`packages/adapter-go-template/runtime/vectors_test.go`,
`packages/adapter-perl/t/helper_vectors.t`,
`packages/adapter-jinja/python/tests/test_helper_vectors.py`,
`packages/adapter-erb/test/helper_vectors_test.rb`,
`packages/adapter-php/tests/test_helper_vectors.php` (the engine-agnostic PHP
runtime shared by the Twig/Blade/... backends); the JS reference
is the generator itself). A harness declares its backend's status in
three tables — this is the **only** place per-backend status is
recorded:

1. **Bindings** — canonical id → the code shape compiled templates
   execute on this backend (a helper function, or the native operator
   the adapter emits). A vector whose `fn` has no binding **fails**:
   a backend cannot silently fall behind the catalogue. Bindings live
   in the harness file itself.
2. **Divergence declarations** — case key → the backend's actual
   value plus a reason, declared in the backend's own package, in a
   file named `vector-divergences.json` (e.g.
   `packages/adapter-perl/t/vector-divergences.json`). A declared case
   asserts the *pinned* value, so the divergence itself is
   regression-tested; if the backend later starts matching JS, the
   stale declaration fails so it gets removed. Divergences are
   visible, enumerable per backend, and never rot as prose. This is
   machine-checked twice: by each harness (which fails on a stale or
   dead declaration) and centrally by
   `packages/adapter-tests/src/__tests__/divergences.test.ts`, which
   discovers every `vector-divergences.json` file under `packages/` by
   basename and validates it (schema, dangling keys, runner-path
   existence, runner/declaration living in the same package, and the
   expected backend set).
3. **Unsupported list** — helper id → reason, declared in the same
   `vector-divergences.json` file, skipped visibly. Empty for mature
   backends; lets a bootstrapping adapter land its harness first and
   burn the list down.

## Adding a catalogue entry

1. Add the entry below: JS semantics, edge rules, vector-domain
   notes (backend-neutral only).
2. Add the JS reference implementation and cases to `cases.ts` — at
   least one vector per rule. Regenerate `vectors.json`.
3. Bind the id in every harness. Where a backend genuinely diverges,
   add an entry to its own `vector-divergences.json` with its measured
   value and reason instead of bending the vector.
4. All harnesses green = done.

## Catalogue

Entries state JS semantics and the vector domain. Domain notes
explain why a region is untested (host-language variance), without
naming backends.

### add / sub / mul

JS numeric `+` / `-` / `*` on number operands; double semantics.
String-operand `+` (concatenation) lowers through interpolation and
is not part of `add`. Beyond the safe-integer range, double rounding
applies (`9007199254740991 + 2` → `9007199254740992`); backends with
64-bit-exact integer arithmetic pin their divergence.

### div

JS `/`: always double division (`7 / 2` → `3.5`); a zero divisor
yields `±Infinity` / `NaN`.

### mod

JS `%`: remainder with the **dividend's** sign (`-7 % 3` → `-1`),
defined on floats (`7.5 % 2` → `1.5`).

### neg

JS unary `-`. (`-0` is value-equal to `0`; JSON cannot carry float
zero sign.)

### string

JS `String(v)`: numbers in shortest round-trip form (including 16–17
significant-digit doubles), `String(null)` → `"null"`,
`String(true)` → `"true"`.

### json

JS `JSON.stringify(v)`, single-argument form. Object key **order** is
not part of the contract (value-compat); vectors use objects whose
insertion order is alphabetical so serialized strings compare equal.
Vectors avoid booleans inside the value (hosts without a boolean type
cannot round-trip them) and non-finite numbers below the top level.

### number

JS `Number(v)`: numeric passthrough; string parsing with surrounding
whitespace trimmed (`" 8 "` → `8`); `""` and `null` → `0`; booleans
→ `1`/`0`; non-numeric strings (and the literal `"NaN"`) → `NaN`.

### floor / ceil / round

JS `Math.floor` / `Math.ceil` / `Math.round` after `Number` coercion
of the operand. `round` rounds half toward **+Infinity**
(`Math.round(-1.5)` → `-1`).

### lower / upper

JS `.toLowerCase()` / `.toUpperCase()`. Vectors stay ASCII: full
Unicode case mapping differs across host libraries and is out of
contract.

### trim

JS `.trim()`. Vectors use ASCII whitespace; exact Unicode whitespace
sets vary across hosts.

### starts_with / ends_with

JS `.startsWith(prefix, position?)` / `.endsWith(suffix,
endPosition?)` → boolean. Empty search string is always `true`; the
optional position re-anchors, clamped to `[0, length]`. Vectors stay
ASCII (index units differ across hosts on astral planes).

### replace

JS `.replace(pattern, replacement)`, string-pattern form, first
occurrence; empty pattern inserts at the front. Vectors avoid
`$`-containing replacements (JS interprets replacement patterns;
template lowerings treat the replacement literally).

### repeat

JS `.repeat(n)` for integer `n ≥ 0` (`0` → `""`). Negative counts
throw in JS — out of scope.

### pad_start / pad_end

JS `.padStart(target, pad?)` / `.padEnd(...)`: pad defaults to one
space, repeats and truncates to fill; empty pad or target ≤ length
returns the receiver. ASCII domain (length units).

### split

JS `.split(separator, limit?)`, string-separator form: literal
matching, trailing empty fields kept (`"a,".split(",")` →
`["a",""]`), empty separator → characters (`"".split("")` → `[]`),
`"".split(",")` → `[""]`, `limit 0` → `[]`. The no-separator form
lowers separately and is not in the vectors.

### len

JS `.length` for arrays (element count) and strings (ASCII domain —
length units differ across hosts otherwise).

### at

JS `.at(i)`: negative indices count from the end; out of range →
`undefined` ≡ `null`.

### includes

JS `.includes(x)` on arrays (strict equality) and strings (substring
test) — one canonical id, receiver-dispatched. Vector domain keeps
needle and elements the same primitive type; cross-type probes are
strict-`false` in JS and backends with string-based equality pin
their divergence.

### index_of / last_index_of

JS `.indexOf(x)` / `.lastIndexOf(x)` → position or `-1`. Same
equality contract as `includes`.

### concat

JS `.concat(other)`, binary form (variadic refused upstream).

### slice

JS `.slice(start, end?)` with negative-index clamping; `start >= end`
→ `[]`.

### reverse

JS `.reverse()` / `.toReversed()` — non-mutating result (SSR renders
a snapshot; the mutate-vs-copy distinction has no template meaning).

### flat

JS `.flat(depth)`; canonical depth `-1` is the compiled `Infinity`
sentinel, `0` a shallow copy.

### join

JS `.join(sep)`: `null`/`undefined` elements render empty
(`[1,null,2].join(",")` → `"1,,2"`). Number elements stringify per
the `string` entry.

### arr

Array-literal lowering `[a, b, …]` — variadic construction in order.

### filter_truthy

JS `arr.filter(Boolean)`: keeps elements truthy under `Boolean(x)` —
note the string `"0"` is truthy in JS.

### Higher-order: canonical projection form

Closures can't ride in JSON, so higher-order entries use the compiled
projection catalogue as canonical args (anything else refuses with
BF101 upstream):

- `filter` / `find` / `find_index` / `find_last` / `find_last_index`:
  `(items, field, value)` ≡ `i => i.field === value`.
- `every` / `some`: `(items, field)` ≡ `i => i.field` (truthiness).

Field names are in JS casing; items are objects. Equality follows the
`includes` contract.

### every / some

JS `.every` / `.some` over the field-truthiness projection.
`every([])` is vacuously `true`; `some([])` is `false`.

### filter / find / find_index / find_last / find_last_index

JS semantics over the field-equality projection: `find`/`find_last`
yield the element or `undefined` ≡ `null`; index forms yield `-1`;
`filter` with no matches yields `[]`.

### sort

JS `.sort(cmp)` / `.toSorted(cmp)` for the accepted comparator
catalogue (`a.f - b.f`, `a - b`, `localeCompare`, relational ternary,
`||`-chained multi-key). Canonical args: `(items, kind, name,
compareType, direction, …)` — one 4-tuple per key; `kind` ∈
`self`/`field`, `compareType` ∈ `numeric`/`string`/`auto`,
`direction` ∈ `asc`/`desc`. Non-mutating, stable.

JS comparison semantics per `compareType`: `numeric` subtracts as
numbers; `string` is `localeCompare` (ICU collation — e.g. `"a"`
orders before `"B"`); `auto` is the relational operator — numeric for
numbers, **lexical for numeric strings** (`"10" < "9"`).

### reduce

JS `.reduce((acc, x) => acc <op> x[.field], init)` /
`.reduceRight(...)`. Canonical args: `(items, op, key_kind, key,
type, init, direction)`; `op` ∈ `+`/`*`; `type` ∈
`numeric`/`string`; `init` as a string (the compiler emits the
decoded seed); `direction` ∈ `left`/`right`. Empty receiver returns
the init. JS `+` semantics apply: numeric-**string** items
concatenate (`0 + "5" + "6"` → `"056"`); `direction` is observable
only for string concatenation.

### flat_map / flat_map_tuple

JS `.flatMap(fn)` for `i => i` / `i => i.field` (canonical `(items,
kind, name)`) and the array-literal tuple form `i => [i.a, i.b]`
(canonical `(items, kind1, name1, …)`). flatMap = map + `flat(1)`:
the scalar form spreads an array-valued projection one level; the
tuple form appends each leaf verbatim (only the literal wrapper
flattens). A `field` projection of a non-object yields `undefined` ≡
`null`.
