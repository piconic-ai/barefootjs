# @barefootjs/php

## 0.34.0

No changes in this release.

## 0.33.6

No changes in this release.

## 0.33.5

No changes in this release.

## 0.33.4

## 0.33.3

## 0.33.2

## 0.33.1

## 0.33.0

### Patch Changes

- af82c38: #2696 Step 2: object-literal spread (`{ ...t, editing: false }`) is admitted at value position; `todo-app`/`todo-app-ssr` graduate off `renderDivergences` on all 7 template-stash adapters.
  
  `ObjectLiteralProperty` (expression-parser.ts) becomes an order-preserving discriminated union — `{ kind: 'prop'; key; keyKind; shorthand; value }` alongside a new `{ kind: 'spread'; expr }` — instead of a flat `{ key; shorthand; value }` shape. Order is significant (`{...t, k: v}` and `{k: v, ...t}` differ in which value wins a shared key), so spread and prop entries share one list rather than splitting into parallel arrays. `convertNode` now converts a `SpreadAssignment` into a `spread` entry instead of falling through to `unsupported` (a computed key, method, or getter/setter still refuses). `checkSupport`'s `object-literal` arm (value position) now checks a spread entry's source expression the same way it checks a prop's value. Every direct consumer of `properties` — `toEvalNode`, `freeVarsInBody`/`freeIdentifiers`, `inlineBinding`, `materializeGetterCalls`, the rewrite walkers, adapter `objectLiteralTo*` helpers, Go's static-literal bakers — is exhaustive over the new `kind` discriminant, so this PR is the complete TS-side fallout of the type change (drift defence: a missed site is a compile error, not a runtime gap).
  
  **Runtime evaluator** (Go `eval.go`, shared Perl `Evaluator.pm`, Python `evaluator.py`, Ruby `evaluator.rb`, PHP `Evaluator.php`, Rust `evaluator.rs`) — all six backends now decode a `spread` entry in an `object-literal` node (the SAME `kind`-tagged shape `toEvalNode` emits for a compiled `*_eval` payload and the raw `ParsedExpr` the `eval-vectors.json` golden corpus carries) by evaluating its source and shallow-merging the result's own keys; a non-object result (including a null/undefined JS spread source) is a no-op. Later entries win on a shared key, in source order, matching JS object-spread exactly — pinned by six new `eval-vectors.json` cases (spread-then-override, override-then-spread, double-spread, the todo-app shape, and two null/undefined-spread no-op cases), proven isomorphic across all six language harnesses.
  
  **Direct value-position lowering** (the 7 template-stash adapters' `objectLiteral` `ParsedExprEmitter` case, for an object-literal spread reached OUTSIDE any evaluator-serialized callback body): each adapter's own merge idiom, folding an order-preserving list of segments (a maximal run of `prop` entries collapses into one native literal; each `spread` entry contributes its own emitted source) — Blade/Twig via a new shared `BarefootJS.php::merge(...$args)` (NOT PHP's own `array_merge()` / Twig's `merge` filter, neither of which accepts the `stdClass` representation a `json_decode()`-sourced object prop uses), ERB via chained `Hash#merge`, real-Perl Mojolicious via a single flattened hashref literal (`{ %{$t}, 'k' => v }`, relying on Perl's own last-write-wins list-to-hash construction), Kolon/Xslate via chained `.merge()`, real Jinja2 via chained `dict(acc, **seg)`, and Go via a new variadic `bf_merge` runtime helper (`bf_map`'s sibling, `runtime/eval.go`) — null-safe (skips a non-map argument) for consistency with the evaluator's semantics. minijinja (Rust) has no `**expr` call-site unpacking (only the power operator), so its builtin `dict(value, **kwargs)` can only express a spread as the FIRST entry followed by identifier-keyed props; any other arrangement self-reports BF101 rather than silently dropping keys (`groupObjectLiteralSegments`, exported from `@barefootjs/jsx`'s `parsed-expr-emitter.ts`, is the one backend-neutral helper every non-Go adapter above builds its fold on; Go reuses it too).
  
  `todo-app` / `todo-app-ssr` graduate off `renderDivergences` on all 7 template-stash adapters: their `todos` signal seeds from `(props.initialTodos ?? []).map(t => ({ ...t, editing: false }))`, and the spread inside that `.map()` callback body now resolves through the runtime evaluator instead of refusing — `computeSsrSeedPlan` classifies the signal `derived`, closing the null-seed gap `#2696` tracked. New fixture `signal-object-spread-init` pins the DIRECT (non-`.map()`) value-position spread with an override (`{ ...base, done: true }`), passing on all 7 template-stash adapters plus Hono — except Go, where it surfaces a PRE-EXISTING, unrelated gap (a `derived` OBJECT-typed signal/memo has no live-template-expression lowering on Go at all, spread or not — every other backend can emit `{% set merged = dict(...) %}`-equivalent live template code, but Go always bakes an object-typed signal/memo field into Go SOURCE at `NewXxxProps` time, and that baker is static-only), pinned in Go's own `renderDivergences` with the reproduction (identical failure with the spread removed).
  
  Also fixes a latent `ssr-seed-plan.ts` bug this step's own fixture exposed: `classify()`'s signal path re-parsed `signal.initialValue` WITHOUT the paren-wrap `analyzer.ts`'s own `signal.parsed` pass already applies, so a bare object-literal initializer (`createSignal({ ...base, done: true })`) misread as a block statement and silently opaqued instead of classifying `derived` — invisible before object-literal could classify `derived` at all. Now prefers the analyzer's already-parenthesised `signal.parsed` (falling back to a parenthesised re-parse, not the bare string).

## 0.32.0

## 0.31.10

## 0.31.9

## 0.31.8

## 0.31.7

## 0.31.6

## 0.31.5

## 0.31.4

## 0.31.3

## 0.31.2

### Patch Changes

- 1c38212: Template-adapter SSR seeding now honors an aliased destructured prop's caller-facing key (#2524 SSR half)

  A renaming destructure (`{ n: count }`) keys template variables by the LOCAL
  binding (`count`, correctly — the template body reads `count`) but the
  caller only ever supplies the CALLER-facing name (`n`). `extractSsrDefaults`
  already emitted that mapping as `SsrDefault.propName`
  (`{"count":{"propName":"n","value":null}}`), but nothing consumed it: every
  template-string adapter's conformance harness (and 3 shipped production
  sites) either discarded `propName` outright or keyed its seeding loop off
  the local name, so a renamed prop's caller value was silently dropped and
  the slot rendered its static default (`null`/`undefined`/`0`) instead.

  - New shared helper `deriveStashFromDefaults` (`@barefootjs/jsx`) — the TS
    twin of the runtime `derive_vars_from_defaults` /
    `_derive_stash_from_defaults` family that already ships in the Ruby,
    Python, PHP, Perl, and Rust runtime ports. For each defaults entry, prefers
    `props[propName]` when the caller supplied a non-nullish value, else the
    static fallback; `isRestProps` entries pass the caller's assembled rest bag
    through; propName-less entries (signal/memo locals) always use the static
    value.
  - All 7 template-string adapters' conformance harnesses (blade, erb, jinja,
    mojolicious, rust/minijinja, twig, xslate) now derive both root-level and
    child-component seeding through this helper (or the matching PRODUCTION
    runtime function, when the harness already drives one) instead of
    hand-flattening `SsrDefault.value`. Child-defaults seeding now carries the
    FULL `{value, propName?, isRestProps?}` shape into the generated render
    script/payload and resolves it per-call against the real caller props, the
    same way `@barefootjs/erb`'s harness already did.
  - Rest-bag "keep" sets (which caller-supplied keys are declared params vs.
    undeclared extras routed into `...rest`) now key off `sourceName ?? name`
    (the caller-facing spelling) instead of the local binding.
  - Three shipped PRODUCTION sites had the same defect class and are fixed
    too: `@barefootjs/rust`'s runtime (`register_components_from_manifest`
    used to flatten `ssrDefaults` with an EMPTY props document at
    registration time, before any caller was known — resolution now happens
    per-call, inside `render_child`, against the real caller props);
    `@barefootjs/mojolicious`'s plugin (`before_render` hook's top-level
    stash seeding); and `@barefootjs/cli`'s Text::Xslate scaffold
    (`app.psgi`'s `ssr_defaults`/`render_component` helpers). All three now
    route through the corresponding runtime's `derive_stash_from_defaults` /
    `_derive_stash_from_defaults`.
  - `Barefoot\BarefootJS::deriveStashFromDefaults` (`@barefootjs/php`) is now
    `public` (was `private`) so the blade/twig conformance harnesses — and any
    caller composing a render by hand, mirroring the Ruby port's own public
    `derive_vars_from_defaults` — can route through the real production logic
    instead of re-deriving it.

  `sourceName ?? name` is an identity for every un-aliased prop, so the rename
  visibility fix itself has no effect on the non-aliased corpus. The merge
  ORDER flip that makes `propName` resolution possible (defaults-derived
  `extra` now applies LAST, over the caller's raw props, instead of first)
  does have two deliberate, narrower behavior changes even for non-aliased
  props — both intentional alignments with the semantics every other runtime
  port (`derive_vars_from_defaults` / `_derive_stash_from_defaults` /
  `derive_stash_from_defaults`) already had, not regressions introduced here:

  - A caller prop passed as explicit `null`/`undefined` now loses to the
    static default, instead of the explicit nullish value winning. This
    matches `deriveStashFromDefaults`'s (and every runtime port's)
    "present and non-nullish" check on `props[propName]` — a flat
    `{...defaults, ...callerProps}` merge can't express that distinction (any
    own key wins, nullish or not); routing through the shared helper can.
  - A caller prop whose name collides with a `propName`-less entry (a
    signal/memo local, e.g. a prop happens to be named the same as an
    internal signal getter) now loses to the signal/memo's static value
    instead of overriding it — `propName`-less entries are, by construction,
    never sourced from `props` in any port; a flat merge accidentally let a
    same-named caller prop shadow one anyway.

  Both changes only bite an existing caller relying on one of these two
  narrow, previously-inconsistent-with-every-other-port behaviors; the common
  case (a caller prop with a concrete, non-nullish value and no name
  collision with an internal signal/memo) is unaffected. Graduates the
  `aliased-destructured-prop` / `composite-row-child-aliased-prop`
  render-divergence pins for all 7 adapters (erb graduates
  `aliased-destructured-prop` only — its child-seeding path was already
  correct). Go's `go run` exit-1 failure (#2525) is untouched by this change
  and stays pinned.

## 0.31.1

## 0.31.0

## 0.30.6

## 0.30.5

## 0.30.4

## 0.30.2

## 0.30.1

## 0.30.0

## 0.29.0

## 0.28.1

## 0.28.0

## 0.27.0

## 0.26.4

## 0.26.3

## 0.26.2

## 0.26.1

## 0.26.0

### Minor Changes

- 050513c: `formatDate` / `format_date` timeZone widens to canonical IANA zone IDs (#2344): `'Asia/Tokyo'`-style zones resolve through each backend's tzdata at the instant being formatted (DST-aware, seconds-precision LMT included), and the literal-locale `toLocaleDateString` sugar admits a named-zone literal the build machine's Intl probe verifies. Breaking contract change: an unresolvable timeZone (unknown zone, non-canonical spelling, malformed or out-of-range offset) now raises the backend's native error instead of silently normalizing to UTC. New runtime dependencies: tzinfo (Ruby), DateTime + DateTime::TimeZone (Perl — the generated zone modules load OlsonDB, which needs DateTime::Duration), chrono-tz (Rust), tzdata (Python, fallback only).

## 0.25.0

## 0.24.1

## 0.24.0

### Patch Changes

- f7f955a: Month/weekday name tokens for date formatting (#2334). `formatDate` gains an explicit `names` table argument (flat 38-slot layout; the `format_date` helper's canonical arity is now 4) and the `MMMM`/`MMM`/`dddd`/`ddd` tokens. The `toLocaleDateString` sugar now admits ANY literal options bag — `{ dateStyle: 'long', timeZone: 'UTC' }`, `{ weekday: 'short', … }` — probing it at build time and shipping the derived pattern plus the name table into the compiled output as an ordinary array argument, so backends stay locale-data-free (type-only) and no runtime ICU/CLDR exists anywhere. Unreproducible forms (era, dayPeriod, 2-digit year, narrow names, non-latn digits) keep refusing loudly per the fidelity rule: reproduce the user's TSX exactly or decline, never approximate.

## 0.23.0

## 0.22.0

### Patch Changes

- fdc5b3e: Add `formatDate(date, pattern, timeZone)` (#2324): a pure-function date formatter with explicit inputs — pattern tokens `YYYY`/`MM`/`M`/`DD`/`D`, timezone `'UTC'` or a fixed `±HH:MM` offset — exported from `@barefootjs/client` and catalogued as the backend-neutral `format_date` template helper. SSR adapters lower the call through the builtin lowering-plugin registry and render it natively on every backend (Go, Ruby, Perl, PHP, Python, Rust) with byte-identical, golden-vector-pinned output; no locale, timezone database, or ICU data is consulted anywhere.

## 0.21.4

## 0.21.3

## 0.21.2

## 0.21.1

## 0.21.0

### Patch Changes

- 495a18f: Add #2274: a `date` catalogue entry lowering a zero-arg `Date.prototype` method call on a `Date`-typed prop (`createdAt.toISOString()`, `updatedAt.getUTCFullYear()`, …) to a backend-neutral `helper-call` LoweringNode instead of refusing it as an uncatalogued rich-type method call (#2273's `checkRichTypeMethodCalls` now exempts it).

  - `@barefootjs/jsx`: `date-lowering.ts` registers the `date` builtin lowering plugin recognizing `getUTCFullYear` / `getUTCMonth` / `getUTCDate` / `getUTCHours` / `getUTCMinutes` / `getUTCSeconds` / `getTime` / `toISOString`; the analyzer widens a destructured `Date`-typed prop's rich-type evidence so the plugin (and the #2273 refusal) can see through the destructure.
  - `@barefootjs/go-template`, `@barefootjs/erb`, `@barefootjs/jinja`, `@barefootjs/php`, `@barefootjs/perl`, `@barefootjs/rust`: each runtime gains a `date(recv, op)` helper (`bf_date` / `bf.date` / `BarefootJS::Date` / `barefootjs.date`) accepting either the backend's own native date/time value or an ISO-8601 string, normalizing both to the same instant before dispatching `op` — pinned against the JS-normative golden vectors (epoch 0, a pre-1970 instant, a leap day, and the four-digit-year boundary). `getUTCMonth` is 0-based, matching JS; every accessor and `getTime` render as an integer; `toISOString` always renders millisecond precision, UTC.

  The Rust runtime additionally gains a hand-rolled proleptic-Gregorian calendar (`date.rs`, Hinnant's `civil_from_days`/`days_from_civil`) and a `JsValue::Date`/`minijinja::Value` native receiver shape — no new crate dependency.

- ea50cdc: Fix #2289: a fragment-rooted child component (`'use client'` component returning `<>…</>`) now hydrates with its parent's live props — callbacks and reactive getters included — instead of silently losing every function-valued prop.

  - `@barefootjs/client`: `$c` / `findSsrScopeBySlotIn` gain a comment-scope fallback (`findCommentChildScope`) that resolves a child declared by a `<!--bf-scope:<parentId>_<slotId>|h=…|m=…-->` marker, registers its proxy element, and hands it to `initChild` — so the child's init runs with the parent's real prop object rather than never running at all (the props JSON in the marker only ever carried the JSON-safe subset). `getCommentScopeBoundary` now honours a paired `<!--bf-/scope:<scopeId>-->` end marker so a fragment scope's queries stop at its real last root instead of leaking onto later parent-owned siblings (the reported misattached-aria symptom); HTML without the end marker falls back to the old heuristic.
  - `@barefootjs/shared`: new `BF_SCOPE_COMMENT_END_PREFIX` constant.
  - `@barefootjs/hono`, `@barefootjs/go-template`, `@barefootjs/erb`, `@barefootjs/jinja`, `@barefootjs/twig`, `@barefootjs/xslate`, `@barefootjs/mojolicious`, `@barefootjs/blade`, `@barefootjs/rust`, `@barefootjs/php`, `@barefootjs/perl`: fragment-rooted templates emit the paired `bf-/scope` end marker after the fragment's last root.
  - `@barefootjs/router`: region diffing normalizes the new end marker's volatile scope id.

## 0.20.0

## 0.19.1

### Patch Changes

- cff038f: Fix #2261: dynamic `style={{ … }}` object-literal values that could break out of a CSS declaration now match Hono's oracle behavior — the unsafe `key:value` pair is dropped entirely — instead of being kept (merely HTML-escaped) as every non-Hono adapter previously did.

  Hono's own `hasUnsafeStyleValue` guard (`hono/jsx/utils.ts`) is a hand-rolled structural scan for characters that could escape a CSS declaration (unbalanced quotes/brackets, bare `;`/`{`/`}`, unterminated comments) — NOT real CSSOM property validation. It is the contract every adapter's SSR output must match byte-for-byte.

  Each adapter gains a single `style_object`/`bf_style_object`/`StyleObjectToCSS` runtime helper (ported byte-for-byte from Hono's scan) that builds the whole CSS string at once: unsafe pairs are omitted, safe values are still HTML-escaped afterward (a structurally "safe" value can still carry a literal `"`/`'`/`&`). `tryLowerStyleObject` in each adapter now emits a single call to this helper instead of per-pair string interpolation.

  - Go: `hasUnsafeStyleValue` + `StyleObjectToCSS` in `bf.go`, registered as `bf_style_object`.
  - ERB/Rust/Jinja/Twig/Blade/Xslate/Mojolicious: analogous `style_object` runtime methods (Rust and PHP and Perl runtimes are each shared across two adapters — minijinja, Twig+Blade, and Xslate+Mojolicious respectively).

  Removes the `style-object-dynamic:gen:color:markup` `skipDataPoints` pin from all eight adapters' conformance tests.

## 0.19.0

## 0.18.7

## 0.18.6

## 0.18.5

### Patch Changes

- e5814a3: Support `Math.min(a, b)` / `Math.max(a, b)` / `Math.abs(v)` over a signal on all 8 template adapters. `Math.floor`/`Math.ceil`/`Math.round` were already registered in each adapter's `templatePrimitives` map (the per-adapter "identifier-path callees rendered in template scope" registry — the shared parser already recognized all six `Math.*` methods uniformly), but `min`/`max`/`abs` were missing entries, so calling them over a signal silently rendered empty.

  Added `Math.min` (arity 2), `Math.max` (arity 2), and `Math.abs` (arity 1) to each adapter's `templatePrimitives` constants table, backed by a runtime helper per language: Go's new `Abs` (`bf.go`, alongside the existing `Min`/`Max`), the shared Perl runtime's `min`/`max`/`abs` (Mojolicious + Text::Xslate, `CORE::abs` to avoid an ambiguous-call warning against the package's own `abs` sub), Python's `min`/`max`/`abs` (native `min`/`max`/`abs`-shaped logic with explicit NaN guards), Ruby's `min`/`max`/`abs` (guarding `#nan?` calls the way `finite_number?` already does, since `number()` can return a plain Integer), the shared PHP runtime's `min`/`max`/`abs` (Twig + Blade), and Rust's `js_min`/`js_max`/`js_abs` (`num.rs`) wired into the minijinja adapter's method dispatch.

  Every `min`/`max` implementation propagates NaN explicitly rather than relying on native comparison operators or built-ins: JS `Math.min(NaN, 5)` is `NaN`, but a native `<`/`>` comparison against NaN is always false in IEEE-754 (silently picking the non-NaN operand), and Rust's `f64::min`/`f64::max` specifically follow IEEE-754 `minNum`/`maxNum` semantics (return the non-NaN operand when only one side is NaN) rather than JS's either-NaN-wins-NaN rule. Fixed a related, previously-uncaught bug this exposed in Go's **existing** `Min`/`Max` (predating this PR, only surfaced once these methods gained golden-vector coverage): they converted operands via `toFloat64`, which silently coerces an unrecognized type (e.g. a non-numeric string) to `0` instead of `NaN` — switched to `Number` plus explicit `math.IsNaN` guards.

  New golden-vector cases (`packages/adapter-tests/vectors/cases.ts` → `vectors.json`) cover order-independence, negative operands, and NaN propagation for `min`/`max`, plus negative/positive/zero/NaN for `abs`, run against Go, Perl, Python, Ruby, and PHP via the shared cross-language harness, with a matching Rust vector test. Hand-written unit test coverage added to each runtime's `template_primitives`-style suite (Perl, Python) mirroring the same cases.

  `math-methods` graduates from a render divergence to a passing render on 7 of 8 template adapters. Go alone keeps the divergence, now with an updated, accurate reason: the fixture's fractional signal value (`-7.6`) is typed as Go `int` (zero value) rather than `float64` — the same root cause already tracked as the separate `number-tofixed` divergence (`typeInfoToGo`'s `kind: 'primitive'` branch hard-codes any TS `number` to Go `int`, never consulting the literal value), not a registry gap; `Math.min`/`Math.max`/`Math.abs` are now correctly registered and lowered on Go.

- 3779c8d: Fix `Object.entries(prop).map(([k, v]) => …)` (and `.keys()`/`.values()`) over an object-shaped prop — previously broken on all 8 template adapters (empty output, wrong keys, or a Go runtime crash).

  The compiler only recognized the array instance-method form (`arr.entries()`/`.keys()`/`.values()`, zero-arg property access) as an iteration-shape loop source — never the static method form `Object.entries(x)`/`.keys(x)`/`.values(x)` on a plain object (one argument, callee `Object.<method>`). Unrecognized, it silently parsed as a generic call and fell through every adapter's expression lowering treating the literal `Object` identifier as a bogus prop reference.

  - Added `IRLoop.objectIteration?: 'entries' | 'keys' | 'values'`, a shared IR field distinct from the existing array-only `iterationShape` (the object case's "index" is a string key, and the collection is a map/dict/hash, not an array/slice — a genuinely different lowering shape, not a variant of the array one). A new `isObjectIteratorCall` recognizer (mirroring the existing `isIteratorShapeCall`) strips the `Object.<method>(...)` wrapper in `transformMapCall`.
  - **Jinja / Twig / minijinja(Rust) / Blade**: lower straight to native map/dict iteration (Python `dict.items()`, PHP `foreach`, minijinja's `|items` filter) — these four preserve JS `Object.entries()`'s insertion-order semantics natively, verified per-language.
  - **Text::Xslate**: `.kv()`/`.keys()`/`.values()` Kolon methods — verified to give deterministic alphabetically-sorted order.
  - **Go**: needed no adapter code changes — the existing generic `{{range $k, $v := .Field}}` lowering already works, since Go's `range` is polymorphic over maps (sorted-by-key via the stdlib's own `fmtsort`).
  - **Mojolicious**: `sort keys %{$hash}`, mirroring the existing `sort keys` convention already used elsewhere in the shared Perl runtime for the same reason (hashes have no native order).
  - **Blade / Twig (PHP)**: added `entries()`/`keys()`/`values()` helper methods to the shared `@barefootjs/php` runtime (`BarefootJS.php`) — Twig's `{% for %}` can't iterate a plain `stdClass` (not `Traversable`); these do a defensive `(array)` cast, which preserves PHP's own insertion order.
  - Go, Rust, and Mojolicious/Xslate lower to a **deterministic sorted-by-key** iteration rather than true JS insertion order, which is physically unrecoverable from those languages' native map types once constructed — documented as a permanent known limitation on `IRLoop.objectIteration`'s docstring, not a follow-up.
  - Fixed a related client-JS regression this surfaced: an object-shaped loop source that happens to be a static module-scope const (e.g. `const chartConfig = {...}`) was previously miscategorized as a "static array" (which assumes a real array, calling `.forEach()`/`.map()` on it) — `isStaticArray` now excludes any `objectIteration`-shaped loop, routing it through the dynamic `mapArray()` reconciliation path instead, whose array-expression reconstruction (`applyObjectIterationWrap`) already handles it correctly.

  `object-entries-map` graduates from a render divergence to a passing render on all 8 adapters; `ui/compat.lock.json` and the divergence declarations are updated accordingly.

  Also fixed the SAME gap in `@barefootjs/hono` (the JSX/JS reference renderer used for `expectedHtml` generation and real Hono apps) — it re-emits real JS for SSR, so it needed the identical `Object.entries/keys/values(x)` reconstruction as the client-JS emitter, caught by its own conformance suite in CI.

- be2b48d: Support `String.prototype.replaceAll(pattern, replacement)` with a string pattern. Previously refused at compile time with BF101 (no lowering existed); the string-pattern form now lowers through a new `replaceAll` `ArrayMethod` IR member — parsed with the same arity/regex/object-literal gates as `.replace` (a regex-literal pattern stays refused, matching `.replace`'s deferred-form treatment) — to a dedicated all-occurrences helper on every backend: Go `bf_replace_all` (`strings.ReplaceAll`), the shared Perl runtime's `replace_all` (Mojolicious + Text::Xslate, index/substr loop keeping the replacement literal), Python's `bf.replace_all` (native `str.replace`, already global by default), Ruby's `bf.replace_all` (an index/splice loop — deliberately not `String#gsub`, which interprets `\1`/`\&` backreferences in the replacement even for a literal pattern), the shared PHP runtime's `replace_all` (`str_replace`, with the empty-pattern case hand-rolled since PHP's `str_replace("")` is a no-op unlike JS), and Rust's `bf.replace_all` (native `str::replace`, already global by default).

  A dedicated helper, not the existing `.replace` lowering with a flag — reusing the first-occurrence helper would have silently truncated the replacement to one match. New golden-vector cases (`packages/adapter-tests/vectors/cases.ts` → `vectors.json`) mirror `.replace`'s cases with a multi-occurrence receiver as the flagship, catching that exact swapped-lowering bug on every runtime that consumes the shared corpus (Go, Perl, Python, Ruby, PHP) plus a matching Rust vector. The `string-replaceall` fixture graduates from a BF101 refusal to a passing render on all eight template adapters.

- 56241b8: Dispatch `.slice()` to a string branch in every backend's runtime helper. `word.slice(0, 4)` on a `string` prop rendered empty (Go/Ruby/Perl/PHP/Rust) or `[]` (Python/Perl EP text) instead of the substring — the adapter can't disambiguate a string receiver from an array receiver at compile time (both lower through the same `bf_slice`/`bf.slice` call), so the compiled template already emits the correct polymorphic call; only the runtime helper itself needed a string branch, the same way `.includes()` already dispatches on the runtime value's type. Negative start (`slice(-4)`), an absent end (`slice(4)`), out-of-range clamping, and multi-byte characters (indexed by code point, not byte offset) all match the JS reference. New golden-vector cases (`packages/adapter-tests/vectors/cases.ts`) pin the string-receiver shape across every runtime that consumes the shared corpus (Go, Perl, Python, Ruby, PHP), plus a matching Rust test. The `string-slice` fixture graduates from all eight template adapters' `renderDivergences` declarations.
- 9b3707a: Support `String.prototype.trimStart()` / `.trimEnd()`. Previously refused at compile time with BF101 (no lowering existed); each now lowers through a dedicated `trimStart` / `trimEnd` `ArrayMethod` IR member — separate members, not a shared `trim` member with a `side` flag, matching the existing `padStart`/`padEnd` and `startsWith`/`endsWith` precedent — to a dedicated one-sided helper on every backend: Go `bf_trim_start` / `bf_trim_end` (`strings.TrimLeftFunc` / `TrimRightFunc` with `unicode.IsSpace`), the shared Perl runtime's `trim_start` / `trim_end` (Mojolicious + Text::Xslate, one-sided `\s` regex), Python's `bf.trim_start` / `bf.trim_end` (native `str.lstrip()` / `rstrip()`), Ruby's `bf.trim_start` / `bf.trim_end` (one-sided `\p{Space}` regex), the shared PHP runtime's `trim_start` / `trim_end` (one-sided `preg_replace`), and Rust's `bf.trim_start` / `bf.trim_end` (native `str::trim_start()` / `trim_end()`).

  Neither has an array equivalent, so unlike `.slice()` there's no receiver-type ambiguity to resolve — each is a plain new method with runtime-type dispatch shared with `.trim()`. Dedicated one-sided helpers, not the existing `.trim()` lowering with a flag — reusing the both-sides helper would have silently stripped whitespace from the wrong side. New golden-vector cases (`packages/adapter-tests/vectors/cases.ts` → `vectors.json`) and hand-written runtime unit tests mirror `.trim()`'s cases with a both-sided-whitespace receiver as the flagship, catching that exact swapped-lowering bug on every runtime. The `string-trim-sided` fixture graduates from a BF101 refusal to a passing render on all eight template adapters.

## 0.18.4

## 0.18.3

## 0.18.2

## 0.18.1

## 0.18.0

### Minor Changes

- 17dfdf8: New engine-agnostic PHP runtime, extracted from `packages/adapter-twig/php` so it can be shared by every PHP templating backend. Ships the `Barefoot\BarefootJS` core (`encode_json`, `mark_raw`, `materialize`, `render_named`, `spread_attrs`, `omit`, `render_child`, ...) and the `Barefoot\Evaluator` expression evaluator, with no dependency on any specific template engine. `@barefootjs/twig`'s `TwigBackend` and `@barefootjs/blade`'s `BladeBackend` both implement the engine backend contract on top of this package (resolved via a composer `path` repository), so adding a new PHP template engine no longer requires re-porting the runtime.
