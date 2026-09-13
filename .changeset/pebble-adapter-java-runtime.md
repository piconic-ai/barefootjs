---
"@barefootjs/pebble": minor
---

Adds the Pebble adapter's Phase 3a Java runtime (#2101): a Gradle project (`packages/adapter-pebble/java/`) implementing the `bf.*` template helper surface and the `ParsedExpr` evaluator, golden-vector tested against the shared `packages/adapter-tests/vectors/` corpus (396/396 helper-vector cases, 102/102 evaluator cases, zero pinned divergences).

This pass also empirically verified the TS adapter core's (#2971) documented assumptions against a real Pebble engine and found one critical bug (Pebble has no `??` operator at all — a template parse error, not a subtly wrong value) plus two minor ones, all fixed directly on top of #2971 in this same stack: JS `??` now routes through a new `bf.coalesce` runtime helper instead of a native (nonexistent) operator, both `~` string-concat operands are now wrapped in `bf.string(...)`, and an inaccurate syntax-table claim about a two-variable `for` form was corrected.

`packages/adapter-pebble/src/test-render.ts` now builds the Java runtime's fat jar once (memoized) and renders hand-written `.peb` templates through a real `java -jar` invocation. The custom `{% set %}...{% endset %}` block-capture extension (needed for JSX-children/named-slot/async-fallback forwarding — stock Pebble has no such tag) and the conformance loop against the shared fixture corpus are separate follow-up PRs in the same stack.
