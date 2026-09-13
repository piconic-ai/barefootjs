# @barefootjs/pebble

Pebble adapter for BarefootJS: compiles the BarefootJS IR (JSX → IR, see
`spec/compiler.md`) into `.peb` template files plus the client JS bundle
every other adapter produces, and ships a Java rendering runtime
(`java/`, landing in a follow-up PR) that renders those templates through
[Pebble](https://pebbletemplates.io/) — no framework is required (Spring
Boot, Ktor, plain Servlet apps all work the same way).

**Status: Phase 1 skeleton (#2101).** `PebbleAdapter` type-checks against
the `TemplateAdapter` interface but its render methods are not implemented
yet — see the tracking issue
[piconic-ai/barefootjs#2101](https://github.com/piconic-ai/barefootjs/issues/2101)
for the full stacked-PR plan (adapter core → Java runtime → conformance
loop → repo integration → docs).

## Design decisions (Phase 0)

Recorded here per the `add-adapter` skill's Phase 0 scoping step, so later
PRs in the stack don't re-litigate them:

- **Runtime model: DSL.** Pebble cannot execute arbitrary JS the way the
  Hono/JSX reference adapter's runtime can — this adapter only ever
  populates `templatePrimitives`, never `clientShimSource` /
  `acceptsTemplateCall`.
- **TS-side port source: `@barefootjs/jinja`.** Pebble's syntax
  (`{{ }}` / `{% if %}` / `{% for %}` / `{% set %}`) is Twig/Jinja-family;
  the adapter core PR ports from `packages/adapter-jinja/src/adapter/
  jinja-adapter.ts` (comparing against `adapter-twig` where a given
  construct's Twig-family answer diffs from Jinja's, per #2101's own
  suggestion), not written from scratch.
- **`templatesPerComponent = true`, extension `.peb`** — one `.peb` file
  per component, matching the Jinja/Twig/ERB/Blade family (filename-based
  template lookup).
- **Helper naming convention: `bf.*`** (e.g. `bf.renderChild(...)`,
  `bf.scopeAttr(...)`), matching the Jinja/Twig/ERB/Blade family's
  dot-method convention rather than Go's `bf_*` or Perl's `bf->*`. Java's
  own idiom (`camelCase` methods on an object) fits this directly.
- **Native runtime location: in-package**, `packages/adapter-pebble/java/`
  — a Gradle project (not Maven), since Gradle's Shadow plugin gives the
  conformance harness a simple way to produce one fat jar the harness
  reuses across all fixtures (see next point).
- **Conformance harness: build-once, like `adapter-rust`.** Pebble/Java
  is a compiled-target harness, not an interpreter-per-fixture one (unlike
  Jinja/Twig/ERB) — 190+ shared fixtures × a JVM cold compile each would
  not be viable. `test-render.ts` builds the Java renderer's fat jar once
  per test run (or reuses a cached one) and shells out `java -jar
  renderer.jar <template-dir> <fixture-json>` per fixture, mirroring
  `adapter-rust`'s prebuilt-binary caching.
- **ParsedExpr evaluator watchpoints** (for `.map()`/`.filter()`/
  `.reduce()`/`.sort()` callback bodies) to verify against the shared
  vector corpus once the Java runtime lands: `long`/`double` number
  split, `String()`-compatible float formatting, SameValueZero
  `.includes`, JS `%` sign, and Pebble's strict-variables/null handling
  vs. Jinja's `ChainableUndefined` (pin the policy explicitly, don't
  assume it transfers).

## Template output shape

- `name: 'pebble'`, `extension: '.peb'`, `templatesPerComponent: true`.
- Hydration markers and the `bf.*` runtime surface will match every other
  adapter's contract (`spec/template-helpers.md`) once the adapter core
  lands.

## Java runtime

Not yet implemented — see "Status" above.
