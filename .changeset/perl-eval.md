---
"@barefootjs/mojolicious": minor
"@barefootjs/xslate": minor
---

Add the shared Perl ParsedExpr evaluator for both backends (#2018, Track C).

`BarefootJS::Evaluator` lands in `packages/adapter-perl/lib/BarefootJS/`
(the engine-agnostic core, alongside `SearchParams.pm`) as **one**
implementation both the Mojo and Xslate backends share. It evaluates a
pure `ParsedExpr` callback body (`reduce` / `sort` / `map` / `filter` /
`find`) against an environment (`{acc, item, …captured free vars}`),
plus `fold` / `sort_by` — the evaluator-driven generalization of the
`bf->reduce` / `bf->sort` callback catalogue (any reducer / comparator
body, lifting the op and pattern restrictions).

The coercion is JS-faithful (ToNumber / ToString / ToBoolean, strict
equality, `Math.round` half-toward-+Infinity) and deliberately distinct
from the divergent `bf->string` / `number` helpers. It distinguishes a JS
*string* `"10"` from a JS *number* `10` via SV flags, so relational
comparison and the `+` overload match JS even for numeric strings —
proven isomorphic with the Go evaluator by the shared Track A golden
vectors (a new `t/eval_vectors.t` runs every `eval-vectors.json` case and
matches the JS reference exactly; same input → same output as Go).

Purely additive (core Perl only: `B` / `POSIX` / `Scalar::Util`); not yet
wired into emit, so existing template output is unchanged. The emit
migration is the follow-up integration (Track E).
