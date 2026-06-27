---
---

Define the lightweight `ParsedExpr` evaluator contract (#2018, Track A).

Documents the pure-expression subset semantics (evaluation order,
numeric/string/boolean coercion, strict equality, allowed operators and
built-in calls) in `spec/compiler.md` under "ParsedExpr Evaluator
Semantics", and adds the cross-language golden vectors that pin it:
`packages/adapter-tests/helper-vectors/eval-cases.ts` (authored as JS
source + environment), the JS reference evaluator `eval-reference.ts`,
the generator `eval-generate.ts`, and the committed `eval-vectors.json`.
A freshness/shape guard (`eval-vectors.test.ts`) keeps the vectors in
sync with the cases.

Backend-independent: no published-package behaviour changes. The Go
(`bf.go`) and shared Perl (`BarefootJS::Evaluator`) implementations that
consume these vectors land in Tracks B and C.
