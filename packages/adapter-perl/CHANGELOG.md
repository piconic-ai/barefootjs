# @barefootjs/perl

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

### Patch Changes

- 39a82a9: Fix #2272: graduate the remaining catalogue pins on Blade, Twig, Xslate, and Mojolicious.

  - **#2260** (controlled/derived boolean SSR seeds) — Blade and Twig (PHP) and Xslate and Mojolicious (Perl, via the shared `BarefootJS.pm` runtime) already picked up the shared-layer `freeIdentifiers()` fix from the original #2260 landing; their `toggle`/`switch`/`checkbox` `skipDataPoints` pins were simply never removed. Verified against real conformance runs — no code changes needed for this part.
  - **#2261** (dynamic style value sanitization) — Xslate's `style-object-dynamic` pin was likewise a leftover: the adapter and shared Perl runtime were already fixed when #2261 landed across all 8 adapters, but this one pin was missed.
  - **#2262** (`.flat(dynamicDepth)` stringification) — Mojolicious's `.join()` lowering called Perl's native `join()` builtin directly on the dereferenced array, bypassing the shared runtime's `join` method entirely; a nested-array element (e.g. `.flat(0)`'s shallow copy) stringified to its Perl memory address (`ARRAY(0x...)`) instead of JS's recursive comma-join. Now routes through `bf->join(...)`, matching Xslate's existing `$bf.join(...)` routing. The shared Perl runtime's own `string()`/`join()` methods also gained the same recursive-array-stringification fix Go/ERB already had (`.flat`'s shallow copy stringified via `Array.prototype.toString`'s `join(',')` semantics, applied recursively), since neither previously handled a nested ARRAY-ref element at all.

  Removes every remaining `toggle:gen:pressed:true` / `switch:gen:checked:true` / `checkbox:gen:checked:true` / `style-object-dynamic:gen:color:markup` / `array-flat-dynamic-depth:gen:depth:zero` / `array-flat-dynamic-depth:gen:depth:negative` pin across the four adapters — all four `skipDataPoints` sets are now empty.

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

### Patch Changes

- 8a313ff: Fix `.length` on strings in the ParsedExpr evaluator (`BarefootJS::Evaluator`, shared by the Mojolicious and Xslate adapters) to count Unicode codepoints instead of UTF-8 bytes. Perl previously counted raw bytes, diverging from JS on any non-ASCII string (e.g. `"café".length` was `5` instead of `4`); it now agrees with JS — and with the Go/Ruby/Python/PHP evaluators, which already counted codepoints — for any BMP-only string. Astral characters (emoji, CJK extension ideographs) still diverge from JS's UTF-16 code-unit count on every backend, a separate, documented, and still-open limitation (#2196 Level 2).

## 0.18.5

### Patch Changes

- 73927ab: Support a JSX element passed as a non-`children` prop (`<Card header={<strong>Title</strong>}>`, the slot / render-prop-lite pattern) on all 8 template adapters. Every adapter already had a mechanism to forward the reserved `children` slot from a parent template into a child render (a captured buffer slice, a `{% set %}` block, a Kolon macro, a Go struct field, ...); named JSX-valued props reuse that exact same mechanism, keyed by the prop's own name instead of `children`, rather than inventing a new shared capture path.

  - **Go**: bakes the value the same way real children are baked (`extractTextChildren` / `extractHtmlChildren`, falling back to `extractScopedHtmlChildren` when the root needs the parent's runtime scope id) and emits it as its own struct field.
  - **Jinja / Twig / Rust (minijinja)**: a `{% set captureName %}...{% endset %}` block per named slot, passed as a dict/hash entry.
  - **Text::Xslate**: a Kolon `macro NAME -> () { ... }` per named slot, called immediately in the hash literal.
  - **Blade**: a PHP output-buffering capture (`ob_start()` / `ob_get_clean()`), wrapped in `$bf->backend->mark_raw(...)` so the child's `{{ }}` doesn't re-escape it.
  - **Mojolicious / Text::Xslate (Perl)**: a `begin %>...<% end` capture (Mojo) / immediate macro call (Xslate) passed into `render_child`'s named-arg list. The shared `BarefootJS.pm` runtime's `render_child` now materializes _every_ prop value (previously only the reserved `children` key) — a no-op for any value that isn't a captured CODE ref, so this generalizes safely to both backends.
  - **ERB**: the same output-buffer-slice capture already used for `children`, but ERB's `<%=` (unlike every other adapter's template tag) has no built-in "safe string" wrapper it can bypass escaping on for a read-back, so the runtime gains one: a new `BarefootJS::SafeString` marker class, returned by `Backend::Erb#mark_raw` (previously an identity no-op) and recognized by `Context#h` to skip re-escaping already-finished HTML forwarded across a parent/child template boundary.

  `jsx-element-prop` graduates from a render divergence to a passing render on all 8 template adapters.

- e5814a3: Support `Math.min(a, b)` / `Math.max(a, b)` / `Math.abs(v)` over a signal on all 8 template adapters. `Math.floor`/`Math.ceil`/`Math.round` were already registered in each adapter's `templatePrimitives` map (the per-adapter "identifier-path callees rendered in template scope" registry — the shared parser already recognized all six `Math.*` methods uniformly), but `min`/`max`/`abs` were missing entries, so calling them over a signal silently rendered empty.

  Added `Math.min` (arity 2), `Math.max` (arity 2), and `Math.abs` (arity 1) to each adapter's `templatePrimitives` constants table, backed by a runtime helper per language: Go's new `Abs` (`bf.go`, alongside the existing `Min`/`Max`), the shared Perl runtime's `min`/`max`/`abs` (Mojolicious + Text::Xslate, `CORE::abs` to avoid an ambiguous-call warning against the package's own `abs` sub), Python's `min`/`max`/`abs` (native `min`/`max`/`abs`-shaped logic with explicit NaN guards), Ruby's `min`/`max`/`abs` (guarding `#nan?` calls the way `finite_number?` already does, since `number()` can return a plain Integer), the shared PHP runtime's `min`/`max`/`abs` (Twig + Blade), and Rust's `js_min`/`js_max`/`js_abs` (`num.rs`) wired into the minijinja adapter's method dispatch.

  Every `min`/`max` implementation propagates NaN explicitly rather than relying on native comparison operators or built-ins: JS `Math.min(NaN, 5)` is `NaN`, but a native `<`/`>` comparison against NaN is always false in IEEE-754 (silently picking the non-NaN operand), and Rust's `f64::min`/`f64::max` specifically follow IEEE-754 `minNum`/`maxNum` semantics (return the non-NaN operand when only one side is NaN) rather than JS's either-NaN-wins-NaN rule. Fixed a related, previously-uncaught bug this exposed in Go's **existing** `Min`/`Max` (predating this PR, only surfaced once these methods gained golden-vector coverage): they converted operands via `toFloat64`, which silently coerces an unrecognized type (e.g. a non-numeric string) to `0` instead of `NaN` — switched to `Number` plus explicit `math.IsNaN` guards.

  New golden-vector cases (`packages/adapter-tests/vectors/cases.ts` → `vectors.json`) cover order-independence, negative operands, and NaN propagation for `min`/`max`, plus negative/positive/zero/NaN for `abs`, run against Go, Perl, Python, Ruby, and PHP via the shared cross-language harness, with a matching Rust vector test. Hand-written unit test coverage added to each runtime's `template_primitives`-style suite (Perl, Python) mirroring the same cases.

  `math-methods` graduates from a render divergence to a passing render on 7 of 8 template adapters. Go alone keeps the divergence, now with an updated, accurate reason: the fixture's fractional signal value (`-7.6`) is typed as Go `int` (zero value) rather than `float64` — the same root cause already tracked as the separate `number-tofixed` divergence (`typeInfoToGo`'s `kind: 'primitive'` branch hard-codes any TS `number` to Go `int`, never consulting the literal value), not a registry gap; `Math.min`/`Math.max`/`Math.abs` are now correctly registered and lowered on Go.

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

- 477406d: Dynamic `.flat(depth)` and a widened `ParsedExpr` runtime evaluator, across all six runtime implementations (#2094, refs #2069).

  - **Dynamic `.flat(depth)`**: a non-literal depth expression (a numeric prop, signal read, arithmetic, …) that itself resolves to a supported `ParsedExpr` is now accepted instead of refusing with BF101 — the depth is coerced at render time per JS `ToIntegerOrInfinity` (truncate toward zero; NaN / negative → `0`; `Infinity` / a huge finite value → flatten fully). The `array-method`/`flat` IR node gains an optional `depthExpr`; the shared `flatMethod` emitter interface widens to `FlatDepth | { expr: ParsedExpr }`. Every runtime routes a dynamic depth through a NEW `flat_dynamic`-family helper (Go `bf_flat_dynamic`/`FlatDynamicDepth`, Perl `bf->flat_dynamic`, Ruby/Python/PHP `flat_dynamic`, Rust `bf.flat_dynamic`) — deliberately separate from the existing `flat` helper (whose `-1` argument is a compile-time sentinel meaning "flatten fully", the opposite of what a genuinely dynamic `-1` means per JS). Coercion parity is pinned by new `flat_dynamic` golden helper vectors run by every backend.
  - **Evaluator nested-callback widening**: the higher-order-callback runtime evaluator (`serializeParsedExpr`/`toEvalNode`) now serializes `.map(cb)` / `.filter(cb)` (1- or 2-param arrows, recursively — nesting is unbounded) and `.join(sep?)` instead of refusing them, so a predicate/projection body like `x => x.tags.filter(t => t.active).length > 0` or `posts.flatMap(p => p.tags.map(t => '#' + t)).join(' ')` now lowers on every template adapter instead of surfacing BF101. `.map`/`.filter` reuse the ordinary `call`/`member`/`arrow` node shape (not a bespoke wrapper), matching the shape the `eval-vectors.json` golden corpus already carries. A nested `.some`/`.find`/`.every`/`.sort`/`.reduce`/`.flat`/`.flatMap` inside a callback body is still refused. All six runtime evaluators implement the new node shapes (Go `eval.go` as the reference, ported to Perl `BarefootJS::Evaluator` — shared by Mojolicious and Xslate — plus Ruby, Python, PHP, and Rust), with 11 new golden eval-vector cases pinning cross-backend parity (join semantics incl. null→`''`, 2-param arrows, the `.length` composition, and a doubly-nested map+join).
  - **`.flatMap(fn, thisArg)`**: the already-correct 2-arg form (the parser has always kept `thisArg`, and every adapter has always ignored it — arrows ignore `this`) is now pinned by a conformance fixture.

  New conformance fixtures (`array-flat-dynamic-depth`, `array-flatmap-nested-map`, `array-flatmap-nested-filter-join`, `array-flatmap-thisarg`) run on every adapter.

- 36fec0e: Lower array-index / nested / rest destructure `.map()` callback params on all template adapters (#2087, refs #2069).

  `LoopParamBinding` gains a structured `segments` path (field/index steps with `isIdent` classification) and the shared gate — renamed `isLowerableLoopDestructure`, old name kept as a deprecated alias — now admits fixed bindings at any path depth (`([k, v])`, `{ cells: [head] }`, `{ user: { name } }`), array-rest (`[first, ...tail]`, lowered as the exact slice), and object-rest used as member access or as a `{...rest}` spread onto an intrinsic element (lowered as a true residual bag via a new per-adapter `omit` runtime helper feeding the existing `spread_attrs` pipeline; ERB uses native `Hash#except`).

  The `rest-destructure-{object-spread,array,nested}-in-map` conformance fixtures graduate from BF104 pins to real-engine HTML comparison on all seven template adapters, alongside the new `destructure-array-index-in-map` / `destructure-nested-object-in-map` fixtures. Still refused (BF104): bare value uses of an object-rest name, spreads onto components/providers, `.filter().map(destructure)` chains, and `__bf_`-prefixed binding names.

  Collateral hardening: `static-array-from-props(-with-component)`'s destructure no longer trips BF104, which exposed an orthogonal gap — a loop array bound to a computed function-scope const would silently render empty. Template adapters now raise a narrow BF101 for that shape instead.

- fa03384: Fix multi-component registry modules (Toast/Dialog/Tabs/DropdownMenu) 500ing on the Perl (mojo) adapter (#2132). A registry module exporting several components from one file compiles to one EP template per component, but the build manifest carried a single `markedTemplate` per entry, so `register_components_from_manifest` never registered the sub-components and every `render_child('toast_provider')` died with "No renderer registered".

  - **`@barefootjs/cli`**: for `templatesPerComponent` adapters, each manifest entry now carries a `components` map — one row per exported component with its own `markedTemplate` and `ssrDefaults`, keyed by the component name. The key comes from the compiler's new structural `componentName` stamp, not the template basename (a single-component file's template is named after the source file, e.g. `index.html.ep`). Additive: every runtime parses manifest entries key-by-key, so older runtimes ignore the new field.
  - **`@barefootjs/jsx`**: `FileOutput` gains an optional `componentName`, set on `markedTemplate` / `ssrDefaults` outputs so the build pipeline can pair them per component without basename guessing.
  - **`@barefootjs/perl`**: `register_components_from_manifest` registers one child renderer per `components` row under the snake_cased component name the compiled templates call (`toast_provider`, `toast_title`, …), seeding each child from its own per-component `ssrDefaults`. Per-component registrations win over the directory-name key — for `ui/toast/index` the key `toast` now resolves to Toast's own template instead of the module's first template (ToastProvider). Manifests from older builds (no `components` map) keep the directory-name behaviour.
  - **`@barefootjs/mojolicious`** (`BarefootJS::Backend::Mojo`): `render_named` now dies when `render_to_string` returns undef (missing template) instead of letting the calling template's `<%==` silently render the child subtree as an empty string, and the active `bf.instance` swap is `local`ized so it's restored when a nested render dies.

### Patch Changes

- 8cb982c: Fix `props_attr` truncating the `bf-p` hydration payload: the encoded props JSON is embedded in a single-quoted attribute, so a raw `'` inside any string value (e.g. a blog paragraph) terminated the attribute early and the client hydrated from broken JSON (island text bound to props rendered empty). The JSON is now attribute-escaped with each runtime's existing HTML escape (`&#34;`/`&#39;`, matching the Go and JS adapters' behavior); the browser entity-decodes the attribute, so the client's `JSON.parse` sees the original text. Same fix applied to the Perl, Python, Ruby, and Rust runtimes, each with a new `props_attr` round-trip test.

## 0.17.1

### Patch Changes

- 6b3bba3: Lower value-producing `.map(cb)` on the template-string adapters via the #2018 runtime evaluator (#2073). A `.map()` whose callback returns a value (the blog-showcase shape `` p.tags.map((t) => `#${t}`).join(' ') ``) previously refused with BF101 on Go / Mojo / Xslate; `map` now joins `CALLBACK_METHODS`, the projection body serializes per element through the new `map_eval` helpers (`bf->map_eval` / `$bf.map_eval` / `bf_map_eval` + `BarefootJS::Evaluator::map_json` / Go `MapEval`), one result per element with no flatten, composing through the existing `.join` lowering. The JSX-returning `.map` is an IRLoop upstream and unaffected; the fall-throughs (a bare `arr.map` reference or a function-reference callback) still refuse loudly.
- 882847c: SSR-compute memos derived from the `createSearchParams()` env signal (#2075), building on the #1922 per-request readers — including LIST-valued filter memos on Go. Env-signal handling is now open-closed: a new `ENV_SIGNAL_READERS` registry in `@barefootjs/jsx` (`envSignalReaderFor` / `envSignalLocalNames`) supplies the canonical reader name and method set, so a future env signal registers once instead of growing per-adapter branches. Mojo/Xslate seed derived memos in-template from the registry-resolved canonical reader (aliased getters canonicalise), with the seed-availability check allowing lowering-internal bindings (arrow/lambda params, Perl's `$_`, Kolon's `$bf`). Go lowers scalar derived memos (`get('k')` bare and `?? '<lit>'` defaulted) and list-filter memos (`props.items.filter(p => …tag()…)` → `bf.FilterEval` with the predicate's getter calls materialized into the env) in the generated constructor, typing filter memos `[]any`. The runtime evaluator gains its first `array-method` — `.includes` (array SameValueZero membership / string substring) — implemented isomorphically in Go and Perl and pinned by new golden vectors; `.every`/`.some` predicates using `.includes` now route through the evaluator on the Perl adapters too. The pre-existing template-position helpers (`bf_includes`, `$bf->includes`) now share the same SameValueZero equality — previously Go used `reflect.DeepEqual` (int/float64 never matched, `[NaN].includes(NaN)` was false) and Perl used stringy `eq` (`[2].includes("2")` was wrongly true) — so `.includes` returns the JS answer regardless of position.

## 0.17.0

### Minor Changes

- 59b4efc: `queryHref` SSR parity for the Mojolicious and Xslate adapters (#2042).

  `queryHref(base, { … })` now lowers to a `query` runtime helper on the Perl adapters, matching the go-template `bf_query` lowering shipped in #2044:

  - **Mojolicious** lowers it to `bf->query(base, …)`, **Xslate** to `$bf.query(base, …)`. Each object property becomes a `(guard, key, value)` triple; the helper includes a pair iff its guard is truthy AND its value is a non-empty string — so a plain `key: v` passes guard `1`, and a conditional `key: cond ? v : undefined` passes the lowered condition (mirroring the client's `if (value)`).
  - A new `query` helper in the shared Perl runtime (`BarefootJS.pm`) builds the URL with `URLSearchParams.set` overwrite semantics and `application/x-www-form-urlencoded` encoding (space → `+`, UTF-8 byte-wise), so the rendered query string equals the browser / Hono render byte-for-byte.
  - `@barefootjs/jsx` gains a backend-neutral `matchQueryHrefCall` / `queryHrefArgs` helper shared by the SSR adapters' lowering.

  Recognition handles aliased imports and both the `@barefootjs/client` and `@barefootjs/client/runtime` entry points. A non-literal params object falls back to the generic lowering.

- caba215: `queryHref` now accepts an **array value** for multi-value query keys (#2048, the Q4 follow-up to #2042): `queryHref(base, { tag: ['a', 'b'] })` → `?tag=a&tag=b`, i.e. `URLSearchParams.append` rather than `set`. Empty / falsy members are skipped (same truthy-omit as a scalar), so an empty — or all-empty — array contributes nothing. `QueryParamValue` becomes `string | string[] | null | undefined`.

  This works across the client and all SSR adapters byte-for-byte:

  - **`@barefootjs/client`**: `queryHref` appends each non-empty array member.
  - **`@barefootjs/perl`** (Mojolicious + Xslate via the shared `query` helper): an array ref appends one pair per non-empty member.
  - **`@barefootjs/go-template`**: `bf_query` appends each non-empty member of a `[]string` (or `[]any`) value. To support this, the value-emptiness check moved from the lowering into the `bf_query` helper itself — a plain `key: v` now lowers to a `(true)` include and a conditional to `(cond)`, and the helper drops an included-but-empty value. This matches the client and Perl exactly (it also removes the previous Go-only divergence where an explicitly-included empty value was kept as `k=`); rendered output for existing scalar usage is unchanged.

  The `query` helper's array behaviour is conformance-tested across the Go and Perl backends via the shared golden helper vectors.

### Patch Changes

- b57ed47: Lower `.flatMap(proj)` through the runtime evaluator (#2018, P3). The projection
  body serializes to a ParsedExpr JSON blob and `bf_flat_map_eval` /
  `bf->flat_map_eval` / `$bf.flat_map_eval` projects each element then flattens
  one level, generalizing the structured self / field / tuple
  (`bf_flat_map` / `bf_flat_map_tuple`) catalogue to any pure projection. A
  projection the evaluator can't model falls back to the structured helper. The
  shared runtime gains `BarefootJS::Evaluator::flat_map` / `flat_map_json` and a
  `flat_map_eval` controller helper (Go `FlatMapEval`, registered as
  `bf_flat_map_eval`). Rendered HTML is unchanged; only the emitted template text
  moves to the evaluator helper. (`.flat(depth?)` is a non-callback array method
  and stays folded.)
- 39fc2ea: Lower standalone `.sort(cmp)` / `.reduce(fn, init)` on the Mojolicious and
  Xslate adapters through the runtime evaluator (#2018, P1 — the Perl half of the
  Go change). The comparator / reducer body is serialized to a ParsedExpr JSON
  blob and evaluated per element by the new `bf->sort_eval` / `bf->reduce_eval`
  (`$bf.sort_eval` / `$bf.reduce_eval` in Xslate) helpers, with captured free
  variables threaded as a `base_env` hashref — generalizing the fixed `bf->sort` /
  `bf->reduce` catalogues to any pure comparator / reducer body. A comparator the
  evaluator can't model (e.g. `localeCompare`) falls back to the legacy `bf->sort`
  path, so behavior there is unchanged. The shared Perl runtime gains
  `BarefootJS::Evaluator::fold_json` / `sort_by_json` (the JSON-string seam the
  templates emit into) and the `sort_eval` / `reduce_eval` controller helpers.
  Rendered HTML is unchanged; only the emitted template text moves to the
  evaluator helpers. The chained `.sort().map()` / `.filter().map()` loop-hoist
  keeps the legacy path until its own phase (P3).
- 6147144: Lower higher-order methods (`.filter` / `.find` / `.findIndex` / `.findLast` /
  `.findLastIndex` / `.every` / `.some`) on the Mojolicious and Xslate adapters
  through the runtime evaluator (#2018, P2 — the Perl half of the Go change). The
  predicate body serializes to a ParsedExpr JSON blob and emits
  `bf->filter_eval` / `bf->find_eval` / `bf->find_index_eval` / `bf->every_eval` /
  `bf->some_eval` (`$bf.…` in Xslate), with captured free vars threaded as a
  `base_env` hashref — the same JS-faithful evaluator the Go adapter uses, so the
  two SSR backends stay byte-isomorphic. A predicate the evaluator can't model
  (e.g. a method-call predicate) falls back to the inline `grep` / Kolon-lambda /
  `bf->find` lowering, and `.filter(Boolean)` keeps its inline truthiness form.

  The shared `BarefootJS` runtime gains `filter_eval` / `every_eval` / `some_eval`
  / `find_eval` / `find_index_eval` controller helpers, delegating to the
  `BarefootJS::Evaluator` predicate helpers. Rendered HTML is unchanged; only the
  emitted template text moves to the evaluator helpers.

## 0.16.0

## 0.15.2

## 0.15.1

## 0.15.0

### Minor Changes

- 8d2cbe8: `searchParams()` (router v0.5) now renders at SSR on the Mojolicious and Xslate template adapters, so the cross-adapter `search-params` conformance fixture (`{searchParams().get('sort') ?? 'none'}`) runs on Perl too instead of being skipped (#1922, follow-up to the Go support).

  - **Lowering** (`@barefootjs/jsx` shared helpers `importsSearchParams` / `matchSearchParamsMethodCall`, consumed by both Perl adapters): `searchParams().get(k)` is recognised as an env-signal method call and lowered to a real method call on the per-request reader — `$searchParams->get('sort')` (Mojo) / `$searchParams.get('sort')` (Xslate) — instead of the broken generic deref (`$searchParams->{get}` / `$searchParams.get`, which dropped the call + argument). Scoped to components that import `searchParams` from `@barefootjs/client`.
  - **Runtime** (`@barefootjs/perl`): new `BarefootJS::SearchParams` — a core-Perl, framework-agnostic reader. `new($query)` parses an `application/x-www-form-urlencoded` query (leading `?`, `+`/`%XX` decoding tolerated); `get($key)` returns the first value, or `undef` when absent. Because the adapters lower `??` to Perl's defined-or `//` (which coalesces only `undef`), this matches JS `??` exactly — an absent key falls back to the author's default while a present-but-empty value (`?sort=`) keeps the empty string (a closer match than the Go adapter, whose `or` lowering also coalesces `''`).
  - **Mojolicious wiring** (`@barefootjs/mojolicious`): the plugin's `before_render` hook seeds the `$searchParams` template var per request from `$c->req->query_params`, so `searchParams()` resolves the live query during SSR (the client re-reads `window.location` on hydration). A caller-set value wins (`//=`).
  - **Xslate**: the backend is framework-agnostic, so the host passes a `searchParams => BarefootJS::SearchParams->new($query)` template var (the conformance harness seeds an empty-query reader; production hosts thread their request query).

- 6547370: Variable element-access + `.toFixed`, and `/* @client */`-guarded memo SSR folding (#1897, data-table):

  - `@barefootjs/jsx`: new `index-access` `ParsedExpr` kind for element access with a non-literal index (`selected()[index]`, `rows[i + 1]`). Previously refused as "Complex computed property access"; now supported and dispatched through a new `ParsedExprEmitter.indexAccess` arm. The Perl adapters disambiguate array (`->[$i]`) from hash (`->{$k}`) deref by the index's type; Xslate/Hono use the language's polymorphic `[]`; Go emits the `index` builtin.
  - `@barefootjs/jsx`: `.toFixed(digits?)` lowers as a new `array-method` across all adapters — `bf->to_fixed` / `$bf.to_fixed` (new Perl runtime helper), `bf_to_fixed` (new Go runtime helper, `fmt.Sprintf("%.*f", …)`), native `.toFixed` on Hono.
  - `@barefootjs/jsx`: `extractSsrDefaults` now folds a block-body memo through a statically-resolvable `if (cond) return …` guard, so a `/* @client */`-guarded memo (`const key = sortKey(); if (!key) return rows; … sort …`) seeds its default-state early-return value instead of `null`.
  - `@barefootjs/mojolicious`: the test harness seeds a root signal whose initial is `null` / unevaluable as `undef` (rather than skipping it), so a getter read only in a child-prop expression doesn't fault strict vars.

  With these, the composed `data-table` demo compiles clean on both Perl adapters and renders structurally byte-identical to Hono on real Mojolicious / Text::Xslate. It stays pinned in `skipJsx` on a single remaining divergence — the scope-ID of imported components inside the keyed `.map` (a hydration-scope concern tracked with #1896), not an expression-lowering gap.

### Patch Changes

- 1f8b1e0: Nested `render_child` calls now resolve and carry correct slot identity. Two fixes (#1897):

  - A child template rendering another imported component (AccordionTrigger → ChevronDownIcon) executed against a fresh `BarefootJS` instance whose child-renderer registry started empty — the registry is now shared with each child instance (test harnesses + `register_components_from_manifest`).
  - `render_child` now invokes the renderer as `$renderer->($props, $invoking_bf)`, and renderer closures derive the child's scope/slot identity from the caller's scope id instead of the registrant's. A grandchild now mounts as `root_s0_s0` rather than collapsing to `root_s0` and colliding `(host, slot)` pairs (#1249 slot-identity contract). Renderer contract note: unpack `@_` (`my ($props, $caller) = @_;`) — a one-argument subroutine signature (`sub ($props)`) enforces arity and will die on the second argument.

## 0.14.0

## 0.13.0

## 0.12.0

## 0.11.0

## 0.10.1

## 0.10.0

## 0.9.6

## 0.9.5

## 0.9.4

## 0.9.3

### Patch Changes

- 03c7a3c: Propagate SSR context (`<Ctx.Provider value>` → `useContext`) on the Mojolicious and Text::Xslate adapters, graduating the `context-provider` conformance fixture to Hono parity.

  Both adapters previously emitted a child template that read an un-seeded consumer variable (`$theme`), so the provider value never reached the descendant — the fixture was skipped (Go already implemented this in #1768; the Perl side was a deferred follow-up).

  The Perl runtime now mirrors the client `provideContext` / `useContext`:

  - `BarefootJS.pm` gains `provide_context` / `revoke_context` / `use_context`, backed by a package-level value stack. SSR rendering is synchronous and the provider's push/pop are perfectly balanced, so the stack always unwinds at the end of each provider subtree — and a package global (rather than `$c->stash` or the backend) is the one store reliably shared between a parent template and the child templates it renders via `render_child` (the Xslate backend runs with `c => undef`; the Mojo path lazily builds a backend per instance).
  - **Mojo**: `emitProvider` brackets the children with `<% bf->provide_context('Ctx', <value>); %>` … `<% bf->revoke_context('Ctx'); %>`, and each `useContext` consumer is seeded with `% my $x = bf->use_context('Ctx', <default>);`.
  - **Xslate**: same, using the inline `<: $bf.provide_context(...) :>` / `<: $bf.revoke_context(...) :>` form (both return `''`, so the interpolation emits nothing) and a `: my $x = $bf.use_context('Ctx', <default>);` line-statement seed.

  Verified end-to-end against real Mojolicious and Text::Xslate. Hono reference snapshots unchanged.

- 42e0ed9: Graduate the `toggle-shared` conformance fixture to Hono parity on the Mojolicious and Text::Xslate adapters — a keyed `.map` of sibling `ToggleItem` children, each with a per-item prop-derived signal. Three gaps were closed (#1297):

  1. **Prop-derived signal SSR seeding.** A signal whose init derives from a prop (`createSignal(props.defaultOn ?? false)`) is now seeded in-template from the passed prop (`% my $on = ($defaultOn // 0);` / `: my $on = ($defaultOn // 0);`), so a loop child honours its own per-item prop instead of the static default. The lowering is gated by `isSupported` (object/array/constant inits never reach `convertExpression*`, so they don't record a spurious BF101 and keep their existing ssr-defaults seeding) and skipped on Text::Xslate for a same-name signal (Kolon can't express `: my $x = … $x …`; those stay on the harness/manifest seeding, which already resolves them from the prop).

  2. **Loop-child scope id.** A loop child now gets a fresh `<ComponentName>_<rand>` scope id (the PascalCase component name) instead of a parent-slot id, matching the Hono reference (`normalizeHTML` canonicalises `<ComponentName>_<rand>` → `<ComponentName>_*`).

  3. **`data-key`.** The JSX `key` (a reserved prop) now lands as `data-key="…"` on the child scope root, for keyed-loop reconciliation parity. `BarefootJS.pm` gains a `_data_key` field + `data_key_attr` helper; `render_child` sets it from the `key` prop; the component root emits it (`bf->data_key_attr` / `$bf.data_key_attr()`), so non-keyed renders add nothing.

  Note: prop-derived signals/memos are now computed in-template from the props they derive from, so a host seeds the _prop_ (e.g. `initial`) rather than the signal value directly. Verified end-to-end against real Mojolicious and Text::Xslate. Hono reference snapshots unchanged.

## 0.9.2

## 0.9.1

## 0.9.0

### Minor Changes

- 848896b: Add `runAdapterConformanceTests` for the Text::Xslate adapter (with a
  `renderXslateComponent` test renderer), validated against the same shared
  fixture corpus as mojo.

  Make the adapter's runtime-helper calls consistent: every JS-semantics-sensitive
  value operation goes through a `$bf` method, so the runtime's JS-compat handling
  is always applied (rather than a raw Kolon builtin). `.filter` / `.every` /
  `.some` / `.find` / `.findIndex` / `.findLast` / `.findLastIndex`,
  `.toLowerCase` / `.toUpperCase`, `.join`, and `.length` lower to the
  corresponding `$bf` methods — new methods
  on the `BarefootJS` runtime in `@barefootjs/perl`. This also fixes a latent bug:
  `.length` previously used Kolon's array-only `.size()`, which faults on a string;
  `$bf.length` handles both arrays (element count) and strings (char count).

  The skip list is verified, not inherited: the six fixtures mojo skips for
  Perl-EP scoping faults (`logical-or-jsx`, `nullish-coalescing-jsx`,
  `branch-map`, `return-logical-or`, `return-nullish-coalescing`, `return-map`)
  all PASS on Xslate, because Kolon resolves variables from the per-render vars
  rather than Perl lexicals. `style-object-dynamic` is pinned as a `BF101`
  diagnostic (a clean refusal) rather than skipped. Eight fixtures remain skipped
  (SSR context, multi-component scope-id harness, Phase-2b `site/ui` primitives),
  each confirmed to genuinely fail.

## 0.8.0

### Minor Changes

- 3ed9659: Add `BarefootJS::DevReload` — framework-agnostic dev browser auto-reload. The
  shared module provides the browser snippet, the `<dist>/.dev/build-id` reader,
  and a ready-made PSGI streaming app (`->to_app`) for the SSE endpoint, so plain
  PSGI/Plack hosts (e.g. the Text::Xslate backend) get the same `barefoot build
--watch` auto-reload as Mojolicious. `Mojolicious::Plugin::BarefootJS::DevReload`
  now delegates its snippet and build-id logic to the shared module (no behaviour
  change).

## 0.7.0

### Minor Changes

- ac91bc6: Extract the engine-agnostic Perl runtime (`BarefootJS.pm`) into a new
  `@barefootjs/perl` package. `@barefootjs/mojolicious` now depends on it and
  keeps only the Mojo-specific pieces — `BarefootJS::Backend::Mojo`, the
  `Mojolicious::Plugin::BarefootJS` binding, and the compile-time adapter that
  emits Embedded Perl (`.html.ep`).

  The runtime is Mojo-free at load time and drives any Perl template engine
  through a pluggable backend (`encode_json` / `mark_raw` / `materialize` /
  `render_named`), with an injectable JSON encoder. SSR output is unchanged for
  the Mojolicious path.

  Note for consumers that wire Perl `@INC` by hand: `BarefootJS.pm` now ships in
  `@barefootjs/perl/lib` rather than `@barefootjs/mojolicious/lib`. Point `@INC`
  at both package `lib/` directories (the Mojolicious integration's build does
  this automatically).

- 199644e: Add `@barefootjs/xslate` — a Text::Xslate (Kolon) adapter that compiles
  BarefootJS IR to `.tx` templates and ships `BarefootJS::Backend::Xslate`. Because
  the rendering backend is framework-agnostic, it runs under any PSGI/Plack app
  (no Mojolicious required). Validated end-to-end against Text::Xslate 3.5.9 and
  served live via Plack.

  The EP→Kolon mapping is mechanical (`<%= X %>` → `<: X :>`, `<%== X %>` →
  `<: X | mark_raw :>`, `bf->m` → `$bf.m()`), so the engine-agnostic
  `BarefootJS` runtime renders through Xslate unchanged.

  Also generalizes the core `render_child` (in `@barefootjs/perl`) to accept the
  single-hashref call form that Text::Xslate Kolon (and Template Toolkit) method
  calls require, in addition to the existing Mojo list form. Backward-compatible.
