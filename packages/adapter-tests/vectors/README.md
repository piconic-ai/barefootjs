# Golden-vector corpus

Language-neutral, JS-normative conformance data proving every
template backend's compiled helpers and expression evaluator behave
like the JS reference. Two corpora live here:

- **`vectors.json`** — the template helper catalogue (arithmetic,
  string, coercion, and the accepted higher-order projection
  functions). Normative spec: `spec/template-helpers.md`.
- **`eval-vectors.json`** — the `ParsedExpr` evaluator used for
  higher-order callback bodies (`reduce` / `sort` / `map` / `filter` /
  `find`). Normative spec: `spec/compiler.md`, "ParsedExpr Evaluator
  Semantics".

Both files are **generated and committed, never hand-edited**. A
freshness test in `packages/adapter-tests/src/__tests__/` fails CI
when a committed file drifts from its case definitions.

## File map

| Source | Generator | Output |
|---|---|---|
| `cases.ts` | `generate.ts` | `vectors.json` |
| `eval-cases.ts` + `eval-reference.ts` | `eval-generate.ts` | `eval-vectors.json` |
| — (hand-maintained) | — | `<backend package>/vector-divergences.json` (see "Divergence declarations" below) |

Regenerate:

```
cd packages/adapter-tests
bun run generate:helper-vectors
bun run generate:eval-vectors
```

## Encoding rules

- Plain JSON: finite numbers, strings, booleans, `null`, and
  arrays/objects thereof.
- A non-finite number in an `expect` value uses the reserved sentinel
  `{"$num": "NaN" | "Infinity" | "-Infinity"}`.
- JS `undefined` in an `expect` value encodes as `null` (backends have
  a single absent value).
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

## Current runners

| Backend | Runner | Declarations |
|---|---|---|
| Go | `packages/adapter-go-template/runtime/vectors_test.go` | `packages/adapter-go-template/runtime/testdata/vector-divergences.json` |
| Perl | `packages/adapter-perl/t/helper_vectors.t` | `packages/adapter-perl/t/vector-divergences.json` |
| Python | `packages/adapter-jinja/python/tests/test_helper_vectors.py` | `packages/adapter-jinja/python/tests/vector-divergences.json` |
| Ruby | `packages/adapter-erb/test/helper_vectors_test.rb` | `packages/adapter-erb/test/vector-divergences.json` |
| PHP | `packages/adapter-twig/php/tests/test_helper_vectors.php` | `packages/adapter-twig/php/tests/vector-divergences.json` |

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
3. Add a `vector-divergences.json` file to **your own package** (next
   to, or near, your runner) per the schema above — no edit to
   `packages/adapter-tests` needed; the central validator discovers it
   by basename. A bootstrapping backend may start with most of the
   catalogue in `unsupported` and burn the list down over time —
   that's expected, not a failure.

Point at any of the four existing runners (table above) as a
reference implementation; they all consume the same two JSON files
and the same divergence-declaration shape.
