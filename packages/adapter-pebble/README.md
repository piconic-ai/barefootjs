# @barefootjs/pebble

Pebble adapter for BarefootJS: compiles the BarefootJS IR (JSX → IR, see
`spec/compiler.md`) into `.peb` template files plus the client JS bundle
every other adapter produces, and ships a Java rendering runtime (`java/`)
that renders those templates through
[Pebble](https://pebbletemplates.io/) — no framework is required (Spring
Boot, Ktor, plain Servlet apps all work the same way).

**Status: Phase 3a landed (#2101)** — the Java runtime (`java/`) now
exists: the `bf.*` helper surface, the `ParsedExpr` evaluator, and a CLI
entry point (`Main`), all golden-vector tested against the shared
`packages/adapter-tests/vectors/` corpus (396/396 helper-vector cases,
102/102 evaluator cases, zero pinned divergences — see "Java runtime"
below for the full research writeup, empirical confirmations, and the
TS-side fixes this pass surfaced). **Phase 3b** (the custom `{% set
%}...{% endset %}` `TokenParser` extension for JSX-children/named-slot/
async-fallback forwarding) **and Phase 4** (the conformance loop against
the ~190 shared fixtures, wiring this runtime into
`runAdapterConformanceTests`) **are next.** `PebbleAdapter`'s render
methods emit real `.peb` template text (see "Template output shape" below
and `src/adapter/pebble-adapter.ts`'s file header for the full
confirmed-Pebble-syntax table and every documented divergence) — Phase 3a's
research pass empirically confirmed most of that file header's flagged
assumptions against a real Pebble engine and refuted one significant one
(`??` does not exist in Pebble at all — see "Java runtime" below). See the
tracking issue
[piconic-ai/barefootjs#2101](https://github.com/piconic-ai/barefootjs/issues/2101)
for the full stacked-PR plan.

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

- `name: 'pebble'`, `extension: '.peb'`, `templatesPerComponent: true` —
  one `.peb` file per component, named by snake-casing the PascalCase
  component name (`UserCard` → `user_card.peb`).
- Hydration markers (`bf-s`, `bf-h`/`bf-m`/`bf-r`, `bf-p`, slot/conditional
  comment markers, loop boundary comments) use the SAME runtime method
  names as every other adapter's `bf.*` calls (`bf.scope_attr()`,
  `bf.hydration_attrs()`, `bf.text_start`/`text_end`, `bf.comment(...)`,
  …) — see `spec/template-helpers.md` for the shared helper contract.
- Every text/attribute interpolation of a possibly-non-string value is
  routed through `bf.string(...)` (or `bf.bool_str(...)` for
  boolean-shaped values); every non-comparison condition position is
  routed through `bf.truthy(...)`. Both are pure Java-runtime helpers, to
  be implemented in Phase 3.
- Control flow uses Pebble's confirmed `{% if %}` / `{% elseif %}` / `{%
  else %}` / `{% endif %}` and `{% for %}` / `{% endfor %}` tags, and its
  confirmed symbolic ternary (`cond ? a : b`) — see
  `src/adapter/pebble-adapter.ts`'s file header for the full syntax table
  and every point where this port took Twig's answer over Jinja's (most
  of them — Pebble is Twig-inspired) or landed on something genuinely
  Pebble-specific (0-based `loop.index`, no `.items()`-style method
  calls). JS `??` is NOT native Pebble syntax (confirmed absent — see
  below) and routes through `bf.coalesce(l, r)` instead.
- **One finding worth calling out here too:** stock Pebble has NO
  block-capture `{% set NAME %}…{% endset %}` form the way Jinja/Twig do
  (confirmed via a 2018 upstream feature request that was never
  implemented) — this adapter still emits that syntax for JSX-children/
  named-slot/async-fallback forwarding, as a deliberate, documented
  requirement that Phase 3's Java runtime register a custom Pebble
  `TokenParser` extension implementing it (Pebble's `Extension` API is
  confirmed to support custom tags). See the adapter file header,
  divergence 6, for the full rationale — this is the headline Phase 3
  dependency, not a quiet TODO.
- Member/index access, JS `===`/`!==`, JS `??`, and JS `+` on string
  operands all route through dedicated `bf.*` runtime helpers (`bf.get`,
  `bf.eq`/`bf.neq`, `bf.coalesce`, and Pebble's own `~` concat operator —
  both `~` operands `bf.string(...)`-wrapped — respectively) rather than
  trusting a native Pebble operator: `??` is CONFIRMED ABSENT from
  Pebble's grammar entirely (not just unverified), and `===`/`!==`'s
  native cross-type-numeric behavior remains unverified — see the file
  header, divergences 3, 4, 6, and 7.

## Java runtime

**Phase 3a landed (#2101): Gradle project, `bf.*` helpers, `ParsedExpr`
evaluator.** Phase 3b (the custom `{% set %}...{% endset %}` `TokenParser`
extension needed for JSX-children/named-slot/async-fallback forwarding) is
a separate follow-up — a `.peb` template using that tag shape does not
render correctly with this runtime alone yet.

### Project layout

```
packages/adapter-pebble/java/
  build.gradle.kts        # Kotlin DSL; io.pebbletemplates:pebble + Shadow + JUnit 5
  settings.gradle.kts
  .gitignore              # .gradle/, build/
  src/main/java/dev/barefootjs/pebble/
    Bf.java               # the `bf` global: every helper the adapter's .peb output calls
    JsNumber.java          # JS-compatible number coercion/formatting (String(n), toFixed, %, round)
    JsValue.java            # JS-compatible stringify/truthy/strict-equals/SameValueZero
    Main.java               # CLI entry point (`java -jar <jar> <templatesDir> <entry> <varsFile>`)
    eval/Evaluator.java     # ParsedExpr evaluator (packages/adapter-tests/vectors/eval-reference.ts port)
    eval/EvalUnsupported.java
  src/test/java/dev/barefootjs/pebble/
    HelperVectorsTest.java  # vectors.json-driven (396 dynamic tests incl. the divergence-ledger check)
    EvalVectorsTest.java     # eval-vectors.json-driven (102 dynamic tests, no divergence allowance)
  src/test/resources/vector-divergences.json   # currently EMPTY — see "Vector conformance results" below
```

No Gradle wrapper is committed. The task environment provisions a matching
`gradle` (8.14.3) directly on `PATH`, and `packages/adapter-pebble/src/
test-render.ts` invokes plain `gradle shadowJar` (memoized, build-once,
mirroring `packages/adapter-rust/runtime`'s prebuilt-binary caching — see
that package's `src/test-render.ts` for the pattern this one ports). If a
committed wrapper later becomes the repo convention for this adapter (e.g.
to pin the exact Gradle version for CI), that is a small follow-up, not a
blocker — `gradle wrapper` generates it from the version already in use.

### Maven coordinates / versions used

- **Pebble**: `io.pebbletemplates:pebble:4.1.2` — the latest release on
  Maven Central at time of writing
  ([central.sonatype.com/artifact/io.pebbletemplates/pebble/4.1.2](https://central.sonatype.com/artifact/io.pebbletemplates/pebble/4.1.2)).
  Minimum Java version: **8** — confirmed via `io.pebbletemplates:pebble`'s
  own `pom.xml` on the `master` branch (tag `4.1.3-SNAPSHOT` at time of
  writing; `github.com/PebbleTemplates/pebble/blob/master/pom.xml`),
  `<java.version>1.8</java.version>` feeding `maven-compiler-plugin`'s
  `<source>`/`<target>`. This runtime's own Gradle toolchain targets 21
  (matching the environment) since nothing here needs the Java 8 floor.
- **Shadow plugin**: `com.gradleup.shadow:8.3.6` (Gradle plugin portal id
  `com.gradleup.shadow`) — the actively maintained fork; the legacy
  `com.github.johnrengelman.shadow` coordinates receive no new releases
  ([plugins.gradle.org/plugin/com.gradleup.shadow](https://plugins.gradle.org/plugin/com.gradleup.shadow),
  [github.com/GradleUp/shadow](https://github.com/GradleUp/shadow)). Note
  for anyone editing `build.gradle.kts`: despite the new plugin/Maven
  coordinates, the Kotlin DSL import path is still the historical
  `com.github.jengelman.gradle.plugins.shadow.tasks.ShadowJar` — the fork
  kept the original Java package name.
- **Gson**: `com.google.code.gson:gson:2.11.0` — for the `bf.json` helper's
  parsing half (decoding the evaluator's serialized-`ParsedExpr` JSON
  payload and the CLI's vars file); `bf.json`'s own JS-`JSON.stringify`
  *output* is hand-written (`Bf.writeJson`), NOT delegated to Gson's
  serializer — see "Vector conformance results" below for why.

### Vector conformance results

`gradle test` is **fully green**: `HelperVectorsTest` — **396/396** dynamic
tests pass (395 cases from `packages/adapter-tests/vectors/vectors.json`
plus the static "every divergence declaration matches a real vector case"
check); `EvalVectorsTest` — **102/102** dynamic tests pass (all of
`packages/adapter-tests/vectors/eval-vectors.json`, which allows **no**
divergence per the vectors README's evaluator-strictness rule).

**`src/test/resources/vector-divergences.json` is empty** (`{"divergences":
{}, "unsupported": {}}`) — every helper in the shared catalogue has a
working Java binding that matches the JS reference EXACTLY, no pinned
departures needed. This is notable because several sibling backends (Ruby,
Perl) DO need divergences here (arbitrary-precision integer arithmetic,
`String#<=>` byte order instead of ICU collation, native `%` following the
divisor's sign) — none of those apply to Java: `double` arithmetic is
IEEE-754 by construction (matches JS exactly, including the safe-integer
rounding edge), `java.text.Collator` reproduces ICU-style
case-insensitive-ish ordering closely enough to match the one `localeCompare`
vector, and Java's native `%` already follows the DIVIDEND's sign (see
divergence-adjacent finding below). Three real implementation bugs were
caught and fixed BY these vectors during development (documented here since
they're genuine "verify empirically, don't assume" lessons for anyone
porting a fifth backend):

1. `Math.min`/`Math.max`/`Math.abs` need FULL JS `Number()` coercion of a
   non-numeric-string operand (`Math.max("not", 5)` → `NaN`), not a
   "the operand is already a number" assumption — unlike `add`/`sub`/`mul`,
   whose vector domain never probes a non-number operand.
2. `reduce`'s `type` field (`"numeric"` vs `"string"`) decodes ONLY the
   initial seed literal's type — folding itself must still apply genuine JS
   `+` semantics from the actual runtime value types at each step, so a
   `type: "numeric"` reduction over STRING items correctly transitions to
   string concatenation mid-fold (`0 + "5" + "6"` → `"056"`, even though the
   declared type says "numeric"). A first implementation that branched
   once on `type` and stayed in "always add as numbers" mode for the whole
   fold got this case wrong.
3. `reduceRight`'s direction changes ITERATION ORDER only — the fold
   expression is always `acc + x` (never swapped to `x + acc`) even when
   walking right-to-left. A first implementation swapped the operand order
   for the rightward case and got `.reduceRight` string-concat backwards.
4. `bf.json` cannot delegate to Gson's own serializer: Gson always renders
   a `double` with a decimal point (`42.0`), which reintroduces exactly the
   long/double-split artifact `JsNumber.numberToString` exists to prevent
   (`JSON.stringify(42)` must be `"42"`). Fixed with a small hand-written
   JSON writer that routes every number through `JsNumber.numberToString`.

### Research findings: the adapter file header's numbered divergences

Verified against `io.pebbletemplates:pebble`'s actual source (cloned from
`github.com/PebbleTemplates/pebble`, `master` @ commit `6cfecef` /
`4.1.3-SNAPSHOT`) and its GitHub wiki
(`github.com/PebbleTemplates/pebble.wiki`, cloned directly since
`pebbletemplates.io` itself is not reachable from this environment) — real
source code and real `PebbleEngine` renders, not documentation alone,
wherever a claim was checkable that way. `pebble-adapter.ts`'s file header
currently numbers ONE MORE divergence (9) than the task's "7 numbered
divergences" framing — all nine are covered below; the two beyond 7 are
divergence 8 (object-entries iteration routing) and divergence 9
(in-template self-reference seeding).

- **Divergence 1 (JS truthiness / `bf.truthy` routing) — CONFIRMED, and
  REFINED to something stronger than "Python/PHP-style truthiness".**
  Pebble's `{% if %}` tag (`IfNode.java`) does NOT have implicit
  empty-container-is-falsy coercion at all: it accepts ONLY `Boolean`,
  `Number`, or `String` — anything else (a raw `List`/`Map`) makes it
  **throw** `PebbleException: "Unsupported value type ... Expected Boolean,
  String, Number in if statement"`. Verified empirically: `{% if items %}`
  with `items: []` throws exactly that exception
  (`io.pebbletemplates.pebble.node.IfNode.render`, `TypeUtils.compatibleCast`
  for `Number`/`String` coercion only). The ternary form used for `&&`/`||`
  is even less forgiving — `TernaryExpression.evaluate` unboxes an
  unconvertible test value with a raw, UNCAUGHT
  `ClassCastException: class java.util.ArrayList cannot be cast to class
  java.lang.Boolean` (verified empirically: `{{ items ? "yes" : "no" }}`
  with `items: []`). Bottom line: the adapter's OWN, ALREADY-implemented
  decision to route every non-boolean-shaped condition-test position
  through `bf.truthy(...)` is not just correct but **load-bearing** — a
  missed spot doesn't silently produce Python/PHP-style wrong output, it
  CRASHES the render. No code change needed (the routing is already
  universal), but the file header's characterization ("follows the same
  ... convention as Python/PHP") should be corrected to something like "no
  native coercion for non-primitives at all; `bf.truthy` supplies the
  entire truthiness story; skipping it for a non-primitive value is a hard
  runtime crash, not silent wrong output."
- **Divergence 2 (stringification via `bf.string`) — CONFIRMED, with an
  empirical illustration of why it's needed everywhere.** Verified: a raw
  `{{ bf.floor(3.7) }}` (skipping the `bf.string(...)` wrap real templates
  always apply) prints `3.0`, not `3` — Pebble's default print path calls
  the boxed `Double`'s own `.toString()`, which does not match JS
  `String(3)`. Confirms the universal `bf.string(...)` wrap at every
  text/attribute position is required, not optional.
- **Divergence 3 (`??` is Pebble-native) — REFUTED. `??` does not exist in
  Pebble at all, in any form, at any version.** `grep -rF '??'` over
  Pebble's entire `pebble/src/main/java` tree (the actual operator-token
  string) matches ZERO files; `CoreExtension.getBinaryOperators()` (the
  complete operator registry) lists `or`/`and`/`is`/`is not`/`contains`/
  `==`/`equals`/`!=`/`>`/`<`/`>=`/`<=`/`+`/`-`/`*`/`/`/`%`/`|`/`~`/`..` and
  nothing else. Confirmed independently via Pebble's OWN
  Twig-compatibility comparison page (`docs/src/orchid/resources/data/
  twig-compatibility/operators.yml`, the project's own authoritative
  Twig-vs-Pebble operator table): the "Others (`..`, `|`, `~`, `.`, `[]`,
  `?:`)" row is marked `support: 'full'` — the ELVIS operator `?:`, not
  Twig's `??` — and Twig's `??` appears nowhere in that file at all.
  Verified empirically a third way: rendering `{{ a ?? b }}` through the
  real engine throws `io.pebbletemplates.pebble.error.ParserException:
  Unexpected token "PUNCTUATION" of value "?"` — a hard PARSE failure, not
  a runtime one. **Every `.peb` template the current TS adapter emits that
  contains a JS `??` will fail to even parse.** See "TS-side fixes needed"
  below — this is the most severe finding of this research pass.
  (Pebble's closest analogue is the `default` filter, `x | default(y)`,
  confirmed `support: 'full'` against Twig's `default` filter in the same
  compatibility table — but it fires on EVERY "empty" value per Pebble's
  own broader `empty` test, i.e. also on `""`, not just `null`/undefined
  like JS `??`, so it is not a safe drop-in either; a dedicated `bf.*`
  helper is the correct fix, mirroring how `===`/`!==` already avoid a
  native operator.)
- **Divergence 4 (`===`/`!==` via `bf.eq`/`bf.neq`, never a native
  operator) — CONFIRMED, and the defensive choice was justified in
  hindsight.** Pebble's `==` (`EqualsExpression`) is documented as using
  `java.util.Objects.equals(a, b)` (`documentation/operator/comparisons.md`)
  — a NULL-SAFE but NOT cross-type-numeric-aware comparison: two boxed
  numbers of different types (e.g. `Integer` vs `Double`) are `.equals()`-
  unequal in Java even when numerically identical, so a native `1 == 1.0`
  would very likely be `false` on Pebble — exactly backwards from JS's
  `1 === 1.0` (`true`, same double). The adapter's decision to never trust
  the native operator and always route through the ONE shared `bf.eq`
  (this runtime's `JsValue.strictEquals`, which compares numbers by
  `double` value regardless of Java boxed type) was the right call.
- **Divergence 5 (no Pebble lambda; evaluator-JSON `*_eval` payload is the
  one higher-order-callback mechanism) — CONFIRMED as a design decision**
  (not an empirical claim to verify) — implemented exactly as specified;
  see `Bf.java`'s `*_eval` methods and `eval/Evaluator.java`.
- **Divergence 6 (`{% set %}...{% endset %}` block-capture requires a
  custom extension) — CONFIRMED, out of scope for this PR (Phase 3b).**
  `SetTokenParser` (`tokenParser/SetTokenParser.java`) parses ONLY
  `set NAME = EXPRESSION` (a single `Expression<?>`, no body/block form);
  there is no `endset` token recognized anywhere in the grammar. Pebble's
  `Extension.getTokenParsers()` API is confirmed (via
  `documentation/guide/extending-pebble.md`'s own worked `SetTokenParser`
  example) to support exactly this kind of custom tag — Phase 3b's planned
  approach is sound.
- **Divergence 7 (reserved-word identifier mangling) — not independently
  re-verified in this pass** (no new empirical test performed beyond what
  Phase 2 already established from Pebble's grammar/keyword list); nothing
  in Phase 3a's research contradicts it.
- **Divergence 8 (object-entries/keys/values routes through dedicated
  `bf.*` helpers, not `for key, value in map`) — the specific claim in the
  syntax table ("Pebble's confirmed `for` tag supports `key, value in
  <map>` directly") is REFUTED, but this has ZERO code impact.**
  `ForTokenParser.parse()` (`tokenParser/ForTokenParser.java`) calls
  `parser.getExpressionParser().parseNewVariableName()` exactly ONCE for
  the iteration variable — there is no comma-separated two-name form in the
  grammar at all; `{% for k, v in map %}` would fail to parse (`expect
  "in"` after the first name, sees `,` instead). Separately confirmed via
  the wiki's own `for` tag doc (`documentation/tag/for.md`): Pebble's
  documented single-variable map-iteration form binds the loop variable to
  a `Map.Entry` (`{{ entry.key }} - {{ entry.value }}`), which is NEITHER
  Twig's "values" answer nor a bare key — a third, genuinely
  Pebble-specific shape. Since divergence 8 was ALREADY designed to avoid
  depending on any native map-iteration shape (routing everything through
  `bf.entries`/`bf.keys`/`bf.values` instead), this refutation changes
  nothing about the adapter's emitted code — only the syntax-table
  documentation comment (`pebble-adapter.ts` line ~39) is inaccurate and
  should be corrected to describe the real (single-variable, `Map.Entry`-
  binding) grammar, or simply removed as irrelevant now that it's
  confirmed unused.
- **Divergence 9 (in-template self-reference seeding, `{% set x = x + 1
  %}`) — CONFIRMED empirically.** Rendered `{% set x = x + 1 %}{{
  bf.string(x) }}` against `{"x": 5}` through the real engine: output is
  `6` — the right-hand `x` resolves from the enclosing (pre-existing
  context) scope before the `set` shadows it, exactly like the
  already-confirmed Jinja/Twig behavior.

### TS-side fixes needed — all three FIXED in follow-up commits on #2971

This Java-runtime task's own scope kept `packages/adapter-pebble/src/adapter/`
read-only, so the three items below were originally flagged here for a
separate fix. The orchestrating session applied all three directly to
PR2 (#2971, already merged into this branch's history) once this research
pass surfaced them, rather than deferring them past this PR:

1. **(Critical — every `??` in a component broke the template's PARSE, not
   just its output. FIXED.)** `expr/emitters.ts`'s `logical()` (both
   copies) now emits `bf.coalesce(${l}, ${r})` instead of the native
   (nonexistent) `(${l} ?? ${r})`, calling this Java runtime's
   `Bf.coalesce(Object a, Object b)`. The file header's divergence 3 text
   was updated to mark it REFUTED rather than confirmed.
2. **(Documentation-only, no runtime-behavior impact. FIXED.)** The file
   header's syntax table, divergence 8, and a code comment near the
   `for`-loop emission all claimed a confirmed native `for key, value in
   map` two-variable form; corrected to describe Pebble's real grammar
   (single-variable, binds to `Map.Entry`). Divergence 8 already routed
   through `bf.entries`/`bf.keys`/`bf.values` unconditionally, so no code
   changed.
3. **(Minor, likely latent. FIXED.)** Both `binary()` implementations now
   wrap both `~` operands in `bf.string(...)`, matching every other
   text/attribute interpolation position (divergence 2) — closing the
   `null`-contributes-nothing / `Double.toString()`-not-JS-`String()` gap
   this research pass identified.

### Empirical confirmations beyond the numbered divergences

- **`.length` access must route through `bf.length(...)`, confirmed the
  hard way while writing this PR's own smoke tests.** A `java.util.List`
  has no `.length` property Pebble's attribute resolution can find
  (`ListResolver` only resolves a NUMERIC index attribute, e.g.
  `items.0`; there is no `getLength()`/`isLength()`/`length()`/`.length`
  field on `ArrayList` for the default reflection-based resolver to find
  either) — a bare `items.length` silently resolves to nothing (`null`,
  under the assumed non-strict-variables config) rather than throwing.
  `expr/emitters.ts` already routes every `.length` access through
  `bf.length(...)` (confirmed at both call sites, ~line 234 and ~452) —
  this is independent confirmation that decision is not just stylistic
  but load-bearing, same as divergence 1's `bf.truthy` finding.

### Sources consulted

- `io.pebbletemplates:pebble` Maven Central listing:
  [central.sonatype.com/artifact/io.pebbletemplates/pebble/4.1.2](https://central.sonatype.com/artifact/io.pebbletemplates/pebble/4.1.2)
- Pebble source (cloned): `github.com/PebbleTemplates/pebble` @ `master`
  (`6cfecef`, `4.1.3-SNAPSHOT`) — `CoreExtension.java` (operator/filter
  registry), `IfNode.java` + `TernaryExpression.java` + `TypeUtils.java`
  (truthiness/coercion), `ConcatenateExpression.java` (`~`),
  `ForTokenParser.java` + `SetTokenParser.java` (grammar), `FileLoader.java`
  + `PebbleEngine.java` (embedding API).
- Pebble wiki (cloned): `github.com/PebbleTemplates/pebble.wiki` —
  `documentation/{tag,operator,filter,test,guide}/*.md`.
- Pebble's own Twig-compatibility data:
  `github.com/PebbleTemplates/pebble/blob/master/docs/src/orchid/resources/data/twig-compatibility/operators.yml`
  (and sibling `filters.yml`/`functions.yml`).
- Shadow Gradle plugin: [gradleup.com/shadow](https://gradleup.com/shadow/),
  [plugins.gradle.org/plugin/com.gradleup.shadow](https://plugins.gradle.org/plugin/com.gradleup.shadow).
- `pebbletemplates.io` itself was NOT reachable from this environment
  (egress-blocked) — the GitHub wiki clone (the same content's source of
  truth; the website is generated from it) was used instead throughout.
