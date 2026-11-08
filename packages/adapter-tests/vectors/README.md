# Golden-vector corpus

Language-neutral, JS-normative conformance data proving every
template backend's compiled helpers and expression evaluator behave
like the JS reference. Three corpora live here:

- **`vectors.json`** — the template helper catalogue (arithmetic,
  string, coercion, and the accepted higher-order projection
  functions). Normative spec: `spec/template-helpers.md`.
- **`eval-vectors.json`** — the `ParsedExpr` evaluator used for
  higher-order callback bodies (`reduce` / `sort` / `map` / `filter` /
  `find`). Normative spec: `spec/compiler.md`, "ParsedExpr Evaluator
  Semantics".
- **`primitives/<op>.json`** — one file per JS primitive operation
  (`truthy`, `to_number`, `to_string`, `get`, `strict_eq`, `lt`, `le`,
  `gt`, `ge`, `plus`, `neg`), the runtime half of the shared
  primitive helpers. Normative spec: `spec/js-primitive-semantics.md`,
  "Conformance". See "Primitive vectors" below.

All of these are **generated and committed, never hand-edited**. A
freshness test in `packages/adapter-tests/src/__tests__/` fails CI
when a committed file drifts from its case definitions.

## File map

| Source | Generator | Output |
|---|---|---|
| `cases.ts` | `generate.ts` | `vectors.json` |
| `eval-cases.ts` + `eval-reference.ts` | `eval-generate.ts` | `eval-vectors.json` |
| `primitives/<op>.ts` (listed in `primitives/index.ts`) | `primitives/generate.ts` | `primitives/<op>.json` |
| the adapters' `NATIVE_SAFE` tables | `primitives/native-safe.ts` | `primitives-native-safe.json` (see "Primitive vectors" below) |
| — (hand-maintained) | — | `<backend package>/vector-divergences.json` (see "Divergence declarations" below) |

Regenerate:

```
cd packages/adapter-tests
bun run generate:helper-vectors
bun run generate:eval-vectors
bun run generate:primitive-vectors
```

## Encoding rules

- Plain JSON: finite numbers, strings, booleans, `null`, and
  arrays/objects thereof.
- A non-finite number in an `expect` value uses the reserved sentinel
  `{"$num": "NaN" | "Infinity" | "-Infinity"}`.
- The `primitives/` files add `{"$num": "-0"}` for negative zero, which
  JSON cannot carry, and use the `$num` sentinel in `args` as well as in
  `expect` (`truthy(NaN)`, `neg(0)`). Every harness materializes it as its
  host's negative-zero double and compares a zero **by sign** (`copysign`
  / `signbit`), so `neg(0)` must return `-0` and `-0 + 0` must return `0`.
  `vectors.json` and `eval-vectors.json` keep the older rule: `-0` is
  value-equal to `0`.
- A native-date `args` value uses the reserved sentinel `{"$date":
  "<ISO-8601>"}` (the `date` helper's cases only, #2288). Each
  harness materializes it into its own native date/time type (Go
  `time.Time`, Ruby `Time`, Python `datetime`, PHP
  `DateTimeImmutable`, Perl `BarefootJS::Date`, Rust
  `JsValue::Date`) before binding — exercising `date()`'s
  native-receiver branch, not just its ISO-string branch. Its
  `expect` is identical to the equivalent plain-ISO-string case,
  since both receiver shapes dispatch against the same instant.
- JS `undefined` uses the reserved one-key sentinel `{"$undef": true}`
  (`spec/js-undefined-value.md`, "JSON encoding for vectors") in all
  three corpora, in `args`, `expect` and the evaluator's `env`. Inside
  an object, a member whose value is the sentinel is a present key
  holding `undefined`, distinct from a missing key; an array hole is
  an element holding `undefined`. The generators refuse data with a
  `$num` or `$undef` key of its own.
- Every harness decodes the sentinel by one rule, kept in one small
  helper per runtime (`vector_undefined.py`, `vector_undefined.rb`,
  `t/lib/VectorUndefined.pm`, `_vector_undefined.php`,
  `VectorUndefined.java` with `JsonDecode.UNDEFINED`,
  `tests/vector_undefined/mod.rs`, and `vectorUndefinedArg` /
  `isRuntimeUndefined` in Go's `vectors_test.go`): in `args` / `env` it is
  the runtime's own undefined value (`UNDEF`, `spec/js-undefined-value.md`),
  and in an `expect` it matches only that value (also nested). A native
  binding is the exception:
  where the host engine has its own undefined (Jinja's `Undefined`,
  MiniJinja's `UNDEFINED`), a native read that yields it matches a
  `$undef` expect, since that is what the template position sees.
- `args` (and the evaluator's `env`) must stay finite — non-finite
  inputs are refused loudly by the generator until a composition case
  needs otherwise.
- A helper-vector case key is `fn + "/" + note`; the pair is unique
  across the file and treated as a stable identifier — divergence
  declarations reference it, so renaming a `note` re-keys them.

## Value-compat comparison contract

The two corpora hold backends to different strictness:

- **Helper vectors (`vectors.json`)** are **value-compat, not
  type-compat**. A backend may return a differently-typed value as
  long as it is value-equal: numbers compare numerically across host
  types (integer vs. float), booleans compare by truthiness
  (`1`/`0` for a host with no boolean type). See
  `spec/template-helpers.md` for the full contract.
- **Evaluator vectors (`eval-vectors.json`)** are stricter: a backend
  evaluator must return a **real boolean** where the reference does,
  and preserve the number-vs-string distinction (numeric-string
  operands do not silently coerce). See `spec/compiler.md`,
  "ParsedExpr Evaluator Semantics", for the exact rules. Evaluator
  vectors allow **no divergence declarations** — every backend must
  match JS exactly here.
- **Primitive vectors (`primitives/`)** are as strict as the evaluator
  vectors (a number is not a numeric string, a string is not a number)
  and compare a zero by sign. A boolean expect needs the host's boolean
  type, except on Perl, which has none: there any non-reference scalar
  or JSON boolean compares by truthiness. They allow no
  `vector-divergences.json` declarations and no expected failures: a
  failing case fails its harness.

## Divergence declarations

A `vector-divergences.json` file — living in each backend's own
package, next to (or near) its runner, e.g.
`packages/adapter-perl/t/vector-divergences.json` — is where a
helper-vector backend records every place it deliberately (or by
host-language limitation) differs from the JS reference, instead of
bending the shared vector data. This file's *contents* stay
package-local, but its *basename* is a fixed convention
(`vector-divergences.json`, not `<backend>.json`) — the central
validator (below) discovers every declaration file under `packages/`
by that exact name, so a new adapter needs no edit here or in the
validator. Schema:

```json
{
  "version": 1,
  "backend": "<name>",
  "runner": "<repo-relative path to the backend's test runner>",
  "spec": "spec/template-helpers.md",
  "divergences": {
    "<fn>/<note>": {
      "reason": "why this backend can't/won't match JS here",
      "expect": <pinned value, or>
      "throws": true
    }
  },
  "unsupported": {
    "<fn>": "why this helper has no binding on this backend yet"
  }
}
```

Each `divergences` entry carries a non-empty `reason` plus **exactly
one** of:

- `expect` — the backend's actual (pinned) value, using the same
  `{"$num": ...}` sentinel encoding as `vectors.json` for non-finite
  numbers.
- `throws: true` — the backend errors on this case instead of
  returning a value. An optional `exception` string names the
  expected exception class (consumed by runners, e.g. Python, that
  can assert on exception type).

The machinery every runner must implement:

1. For each case in `vectors.json`, bind `fn` to the backend's code
   shape and evaluate it against `args`.
2. If the case's key (`fn/note`) has a `divergences` entry, assert the
   result equals the entry's **pinned** value (or that evaluation
   throws, for `throws: true`) — this regression-tests the divergence
   itself. If the backend starts matching JS, the stale declaration
   must fail so it gets deleted.
3. If the case's `fn` is in `unsupported`, skip it visibly (not
   silently) with the declared reason.
4. Otherwise assert the result matches `expect` under value-compat.
5. A `divergences` or `unsupported` key that names no real vector
   case (or helper) is dead and must fail — same as a plain drift.

This declaration file is checked twice: by the backend's own harness
(schema-adjacent, drift against live results) and centrally by
`packages/adapter-tests/src/__tests__/divergences.test.ts`, which
walks `packages/` from the repo root for every file named
`vector-divergences.json` (skipping `node_modules`, `dist`, and hidden
directories), validates each one's schema, cross-references every key
against `vectors.json`, confirms the declared `runner` path exists and
lives in the same package as the declaration file, and confirms the
discovered `backend` values are unique and include the expected set
(`go`, `perl`, `python`, `ruby`) — a new adapter's file extends that
set automatically; an existing backend silently disappearing still
fails.

## Primitive vectors

`primitives/<op>.ts` holds one operation: its canonical helper id, the
rollout step that owns it (`spec/js-primitive-semantics.md`, "Rollout
plan"), the literal JS expression it lowers (the reference) and its
cases. Each case carries a `domain` naming the proof it belongs to
(`number-pair`, `string-pair`, `array-index`, …; the full list is
`Domain` in `primitives/types.ts`), so a harness can run a native
operator over exactly the domains its adapter's `NativeSafeTable`
claims. A case key is `fn + "/" + note`, unique across the corpus.

Every runtime harness (table below) loads every `primitives/*.json`,
binds each `fn` to the runtime helper compiled templates call, and runs
every case. An unbound `fn` fails. Where a runtime had no helper for an
operation, it gained a thin one that delegates to its callback
evaluator's primitive of the same operation (as PHP's `index` delegates
to `Evaluator::index`), so the template helper and the evaluator share
one implementation.

Each harness also binds an op to its runtime's **native** operator (for
`truthy`, the host's own `if`: Go's `template.IsTrue`, Perl's and PHP's
truthiness, a real Jinja, Pebble or MiniJinja `{% if %}`, Ruby's
truthiness; for `get`, the host's own subscript: Go's `index` builtin,
Perl's `->[]`, PHP's and Ruby's `[]`, a real Jinja, Pebble or MiniJinja
`[]`) and runs it over exactly the cases whose `domain` the runtime
claims in `primitives-native-safe.json`. That file is generated from the
adapters' `NATIVE_SAFE` tables by `primitives/native-safe.ts` (a runtime
claims the union of its adapters' tables: Mojolicious and Xslate share
Perl, Twig and Blade share PHP), and generation refuses a claimed proof no
vector domain covers. A native claim the vectors refute fails the harness.
Only the ops a rollout step has wired are listed
(`truthy`, step 1; `get`, step 2; `to_number` and `lt` / `le` / `gt` /
`ge`, step 3; `to_string` and `plus`, step 4; `number`, step 6). A domain
no table claims runs under the helper binding only: today
`beyond-safe-integer`, the `plus` cases whose sum passes 2^53, where Ruby,
Python and PHP add integers exactly (`spec/js-primitive-semantics.md`,
"Decisions" (5); the limitation `plus-beyond-safe-integer`).

## Current runners

| Backend | Helper runner | Declarations | Primitive runner (native-safe key) | Eval runner |
|---|---|---|---|---|
| Go | `packages/adapter-go-template/runtime/vectors_test.go` | `packages/adapter-go-template/runtime/testdata/vector-divergences.json` | `packages/adapter-go-template/runtime/primitive_vectors_test.go` (`go`) | `packages/adapter-go-template/runtime/eval_vectors_test.go` |
| Perl (Mojolicious, Xslate) | `packages/adapter-perl/t/helper_vectors.t` | `packages/adapter-perl/t/vector-divergences.json` | `packages/adapter-perl/t/primitive_vectors.t` (`perl`) | `packages/adapter-perl/t/eval_vectors.t` |
| Python (Jinja) | `packages/adapter-jinja/python/tests/test_helper_vectors.py` | `packages/adapter-jinja/python/tests/vector-divergences.json` | `packages/adapter-jinja/python/tests/test_primitive_vectors.py` (`python`) | `packages/adapter-jinja/python/tests/test_eval_vectors.py` |
| Ruby (ERB) | `packages/adapter-erb/test/helper_vectors_test.rb` | `packages/adapter-erb/test/vector-divergences.json` | `packages/adapter-erb/test/primitive_vectors_test.rb` (`ruby`) | `packages/adapter-erb/test/eval_vectors_test.rb` |
| PHP (Twig, Blade) | `packages/adapter-php/tests/test_helper_vectors.php` | `packages/adapter-php/tests/vector-divergences.json` | `packages/adapter-php/tests/test_primitive_vectors.php` (`php`) | `packages/adapter-php/tests/test_eval_vectors.php` |
| Java (Pebble) | `packages/adapter-pebble/java/src/test/java/dev/barefootjs/pebble/HelperVectorsTest.java` | `packages/adapter-pebble/java/src/test/resources/vector-divergences.json` | `packages/adapter-pebble/java/src/test/java/dev/barefootjs/pebble/PrimitiveVectorsTest.java` (`java`) | `packages/adapter-pebble/java/src/test/java/dev/barefootjs/pebble/EvalVectorsTest.java` |
| Rust (MiniJinja) | `packages/adapter-rust/runtime/tests/helper_vectors.rs` | `packages/adapter-rust/runtime/tests/vector-divergences.json` | `packages/adapter-rust/runtime/tests/primitive_vectors.rs` (`rust`) | `packages/adapter-rust/runtime/tests/eval_vectors.rs` |

The JS reference is the generator itself (`cases.ts` / `generate.ts`,
`eval-cases.ts` / `eval-reference.ts` / `eval-generate.ts`) — there is
no separate JS runner because the generator *is* the source of truth
the vectors are computed from.

## Adding a new backend

A new adapter gets the full conformance guarantee by adding **one**
test runner in its own language — no TS/JS tooling required, the
corpus is plain JSON. The runner must:

1. Read `vectors.json`, bind each canonical `fn` to the code shape its
   compiled templates actually execute (a helper function, or the
   native operator the adapter emits), and compare results under
   value-compat (see above).
2. Read `eval-vectors.json` and run each case's `ParsedExpr` tree
   through the backend's evaluator, matching the reference exactly
   (no divergence allowance).
3. Read every `primitives/*.json`, bind each op to the backend's
   helper (delegating to its evaluator primitive), and pass every case
   (see "Primitive vectors"). Bind each op of `primitives-native-safe.json`
   to the backend's native operator too, add the adapter to
   `RUNTIME_TABLES` in `primitives/native-safe.ts`, and run the native
   binding over the domains its `NATIVE_SAFE` table claims.
4. Add a `vector-divergences.json` file to **your own package** (next
   to, or near, your runner) per the schema above — no edit to
   `packages/adapter-tests` needed; the central validator discovers it
   by basename. A bootstrapping backend may start with most of the
   catalogue in `unsupported` and burn the list down over time —
   that's expected, not a failure.

Point at any of the existing runners (table above) as a
reference implementation; they all consume the same JSON corpora
and the same divergence-declaration shape.
